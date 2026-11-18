import type { Engine, JournalDocument } from "@larkx/core";

import {
  MAX_BATCH_BYTES,
  MAX_BATCH_EVENTS,
  buildRunBatch,
  snapshotHash,
  type BuiltBatch,
  type TelemetrySource,
} from "./project.js";
import {
  emptyDestination,
  isInstallationId,
  type DestinationState,
  type PendingBatch,
  type TelemetryDocument,
  type TelemetryStateStore,
} from "./state.js";

export type TelemetryPhase = "idle" | "pending" | "offline" | "unauthorized";

export type TelemetryError =
  | "unauthorized"
  | "offline"
  | "invalid_batch"
  | "history_conflict"
  | "sequence_gap"
  | "batch_too_large"
  | "sensitive_payload"
  | "malformed_ack"
  | "stopped"
  | "unsupported"
  | null;

export interface TelemetryStatus {
  readonly phase: TelemetryPhase;
  readonly installationId: string | null;
  readonly pendingEvents: number;
  readonly lastError: TelemetryError;
  readonly lastSyncedAt: number | null;
}

export interface FlushResult {
  readonly delivered: boolean;
  readonly phase: TelemetryPhase;
  readonly error: TelemetryError;
}

export interface JournalSource {
  listRuns(): Promise<readonly { readonly runId: string; readonly updatedAt: number }[]>;
  readJournal(runId: string): Promise<JournalDocument | null>;
}

export interface TelemetryFetch {
  (
    url: string,
    init: {
      readonly method: "POST";
      readonly headers: Readonly<Record<string, string>>;
      readonly body: string;
      readonly signal: AbortSignal;
    },
  ): Promise<{ readonly status: number; text(): Promise<string> }>;
}

export interface CloudTelemetry {
  start(): void;
  /** Stop the foreground timer without dropping unacknowledged batches. */
  setActive(active: boolean): void;
  /**
   * Send pending batches.
   * A manual flush retries an authorization failure or a held batch once.
   * The foreground timer calls this with `manual: false` so those failures do not spin.
   */
  flush(options?: { readonly manual?: boolean }): Promise<FlushResult>;
  stop(): Promise<void>;
  current(): TelemetryStatus;
}

export interface CloudTelemetryOptions {
  /** Origin of LarkX Cloud, such as `https://cloud.larkx.ai`. The exporter posts to `/v1/telemetry/batches`. */
  readonly endpoint: string;
  /** Project ingestion key. Cloud expects `lkx_ing_...`. */
  readonly apiKey: string;
  readonly journal: JournalSource;
  readonly state: TelemetryStateStore;
  readonly appId: string;
  readonly runtime: "node" | "react-native";
  /** Used only when this store does not already have an installation id. */
  readonly installationId?: string;
  readonly clock?: { now(): number };
  readonly createId?: () => string;
  /** Foreground synchronization interval. `0` leaves synchronization to `flush()`. */
  readonly intervalMs?: number;
  readonly maxEvents?: number;
  readonly requestTimeoutMs?: number;
  readonly maxBackoffMs?: number;
  readonly fetch?: TelemetryFetch;
}

const RETRYABLE = new Set([408, 429, 500, 502, 503, 504]);

export function journalFromEngine(engine: Engine): JournalSource {
  return {
    async listRuns() {
      const runs = await engine.listRuns();
      return runs.map((run) => ({ runId: run.runId, updatedAt: run.updatedAt }));
    },
    readJournal(runId) {
      return engine.readJournal(runId);
    },
  };
}

export function createCloudTelemetry(options: CloudTelemetryOptions): CloudTelemetry {
  return new CloudExporter(options);
}

class CloudExporter implements CloudTelemetry {
  private readonly endpoint: string;
  private readonly apiKey: string;
  private readonly journal: JournalSource;
  private readonly state: TelemetryStateStore;
  private readonly sourceBase: Pick<TelemetrySource, "appId" | "runtime">;
  private readonly requestedInstallationId: string | null;
  private readonly clock: { now(): number };
  private readonly createId: () => string;
  private readonly intervalMs: number;
  private readonly maxEvents: number;
  private readonly requestTimeoutMs: number;
  private readonly maxBackoffMs: number;
  private readonly fetchImpl: TelemetryFetch;
  private readonly destinationIdPromise: Promise<string>;
  private document: TelemetryDocument | null = null;
  private timer: number | undefined;
  private active = false;
  private stopped = false;
  private inflight: Promise<FlushResult> | null = null;
  private abort: AbortController | null = null;
  private phase: TelemetryPhase = "idle";
  private lastError: TelemetryError = null;
  private pendingEvents = 0;
  private syncedAt: number | null = null;

  constructor(options: CloudTelemetryOptions) {
    this.endpoint = options.endpoint.replace(/\/+$/, "");
    this.apiKey = options.apiKey;
    this.journal = options.journal;
    this.state = options.state;
    this.sourceBase = { appId: options.appId, runtime: options.runtime };
    this.requestedInstallationId = options.installationId ?? null;
    this.clock = options.clock ?? { now: () => Date.now() };
    this.createId = options.createId ?? randomUuid;
    this.intervalMs = options.intervalMs ?? 15_000;
    this.maxEvents = Math.max(1, Math.min(options.maxEvents ?? 100, MAX_BATCH_EVENTS));
    this.requestTimeoutMs = options.requestTimeoutMs ?? 10_000;
    this.maxBackoffMs = options.maxBackoffMs ?? 60_000;
    this.fetchImpl = options.fetch ?? defaultFetch;
    this.destinationIdPromise = destinationId(this.endpoint, this.apiKey);
  }

  start(): void {
    this.stopped = false;
    this.setActive(true);
    void this.ensureDocument();
  }

  setActive(active: boolean): void {
    this.active = active && !this.stopped;
    this.armTimer();
  }

  flush(options?: { readonly manual?: boolean }): Promise<FlushResult> {
    if (this.inflight) {
      return this.inflight;
    }
    const run = this.flushOuter(options?.manual !== false);
    this.inflight = run;
    return run.finally(() => {
      if (this.inflight === run) {
        this.inflight = null;
      }
    });
  }

  async stop(): Promise<void> {
    this.stopped = true;
    this.active = false;
    this.clearTimer();
    this.abort?.abort();
    await this.inflight;
  }

  current(): TelemetryStatus {
    return {
      phase: this.phase,
      installationId: this.document?.installationId ?? null,
      pendingEvents: this.pendingEvents,
      lastError: this.lastError,
      lastSyncedAt: this.syncedAt,
    };
  }

  private async flushOuter(manual: boolean): Promise<FlushResult> {
    try {
      return await this.flushInner(manual);
    } catch {
      this.phase = "offline";
      this.lastError = "offline";
      return this.result(false);
    }
  }

  private async flushInner(manual: boolean): Promise<FlushResult> {
    if (this.stopped) {
      this.lastError = "stopped";
      return this.result(false);
    }
    const loaded = await this.ensureDocument();
    const destinationKey = await this.destinationIdPromise;
    let destination = loaded.destinations[destinationKey] ?? emptyDestination();
    if (manual) {
      destination = {
        ...destination,
        authBlocked: false,
        hold: null,
        backoffAttempt: 0,
        nextAttemptAt: 0,
      };
    }
    if (!this.apiKey.startsWith("lkx_ing_")) {
      destination = { ...destination, authBlocked: true, lastError: "unauthorized" };
      await this.persist(loaded, destinationKey, destination);
      this.phase = "unauthorized";
      this.lastError = "unauthorized";
      return this.result(false);
    }
    let delivered = false;
    for (let turn = 0; turn < 8; turn += 1) {
      if (this.stopped) {
        this.lastError = "stopped";
        break;
      }
      if (destination.authBlocked) {
        this.phase = "unauthorized";
        this.lastError = "unauthorized";
        break;
      }
      if (destination.hold && destination.pending) {
        this.phase = "pending";
        this.lastError = asTelemetryError(destination.hold);
        break;
      }
      if (
        destination.pending &&
        destination.nextAttemptAt > this.clock.now() &&
        destination.backoffAttempt > 0
      ) {
        this.phase = "offline";
        this.lastError = asTelemetryError(destination.lastError);
        break;
      }
      let pending = destination.pending;
      if (!pending) {
        const built = await this.selectBatch(loaded.installationId, destination);
        if (built === "idle") {
          destination = {
            ...destination,
            backoffAttempt: 0,
            nextAttemptAt: 0,
            lastError: null,
          };
          this.phase = "idle";
          this.lastError = null;
          break;
        }
        if (typeof built === "string") {
          destination = { ...destination, hold: built, lastError: built, pending: null };
          this.phase = "pending";
          this.lastError = asTelemetryError(built);
          break;
        }
        pending = built;
        destination = { ...destination, pending, hold: null };
        await this.persist(loaded, destinationKey, destination);
      }
      const outcome = await this.post(pending);
      if (outcome.kind === "accepted") {
        const cursor = Math.max(destination.cursors[pending.runId] ?? 0, outcome.acceptedThrough);
        const snapshots = { ...destination.snapshots };
        if (outcome.acceptedThrough >= pending.throughSequence) {
          snapshots[pending.runId] = pending.snapshotHash;
        }
        destination = {
          ...destination,
          cursors: { ...destination.cursors, [pending.runId]: cursor },
          snapshots,
          pending: null,
          backoffAttempt: 0,
          nextAttemptAt: 0,
          hold: null,
          lastError: null,
          lastSyncedAt: this.clock.now(),
        };
        delivered = true;
        this.phase = "pending";
        this.lastError = null;
        await this.persist(loaded, destinationKey, destination);
        continue;
      }
      if (outcome.kind === "partial") {
        destination = {
          ...destination,
          cursors: {
            ...destination.cursors,
            [pending.runId]: Math.max(
              destination.cursors[pending.runId] ?? 0,
              outcome.acceptedThrough,
            ),
          },
          pending: null,
          backoffAttempt: 0,
          nextAttemptAt: 0,
          hold: null,
          lastError: null,
          lastSyncedAt: this.clock.now(),
        };
        delivered = true;
        await this.persist(loaded, destinationKey, destination);
        continue;
      }
      if (outcome.kind === "rewind") {
        destination = {
          ...destination,
          cursors: { ...destination.cursors, [pending.runId]: outcome.haveThroughSequence },
          pending: null,
          hold: null,
          lastError: "sequence_gap",
          backoffAttempt: 0,
          nextAttemptAt: 0,
        };
        this.lastError = "sequence_gap";
        await this.persist(loaded, destinationKey, destination);
        continue;
      }
      if (outcome.kind === "unauthorized") {
        destination = {
          ...destination,
          authBlocked: true,
          lastError: "unauthorized",
          backoffAttempt: 0,
          nextAttemptAt: 0,
        };
        this.phase = "unauthorized";
        this.lastError = "unauthorized";
        await this.persist(loaded, destinationKey, destination);
        break;
      }
      if (outcome.kind === "hold") {
        destination = {
          ...destination,
          hold: outcome.error,
          lastError: outcome.error,
          backoffAttempt: 0,
          nextAttemptAt: 0,
        };
        this.phase = "pending";
        this.lastError = outcome.error;
        await this.persist(loaded, destinationKey, destination);
        break;
      }
      const retryError = outcome.kind === "malformed" ? "malformed_ack" : "offline";
      const attempt = destination.backoffAttempt + 1;
      destination = {
        ...destination,
        backoffAttempt: attempt,
        nextAttemptAt: this.clock.now() + backoffMs(attempt, this.maxBackoffMs),
        lastError: retryError,
        hold: null,
      };
      this.phase = outcome.kind === "malformed" ? "pending" : "offline";
      this.lastError = retryError;
      await this.persist(loaded, destinationKey, destination);
      break;
    }
    this.syncedAt = destination.lastSyncedAt;
    this.pendingEvents = await this.countPending(loaded.installationId, destination);
    if (this.pendingEvents === 0 && this.phase !== "unauthorized" && this.lastError === null) {
      this.phase = "idle";
    }
    await this.persist(loaded, destinationKey, destination);
    return this.result(delivered);
  }

  private async selectBatch(
    installationId: string,
    destination: DestinationState,
  ): Promise<PendingBatch | "idle" | "too_large" | "unsupported" | "gap"> {
    const runs = [...(await this.journal.listRuns())].sort(compareRuns);
    let blocked: "gap" | "unsupported" | null = null;
    for (const listed of runs) {
      const journal = await this.journal.readJournal(listed.runId);
      if (!journal || journal.events.length === 0) {
        continue;
      }
      const maxSequence = journal.events.reduce((max, event) => Math.max(max, event.sequence), 0);
      const cursor = destination.cursors[listed.runId] ?? 0;
      const hash = snapshotHash(journal);
      const source: TelemetrySource = { ...this.sourceBase, installationId };
      if (cursor < maxSequence) {
        const fromSequence = cursor + 1;
        const built = buildRunBatch({
          journal,
          fromSequence,
          batchId: this.createId(),
          exportedAt: this.clock.now(),
          source,
          maxEvents: this.maxEvents,
          maxBytes: MAX_BATCH_BYTES,
        });
        if (typeof built !== "string") {
          return toPending(built);
        }
        if (built === "too_large") {
          return built;
        }
        if (built === "gap" || built === "unsupported") {
          blocked = built;
        }
        continue;
      }
      if (destination.snapshots[listed.runId] !== hash) {
        const last = [...journal.events]
          .sort((left, right) => left.sequence - right.sequence)
          .at(-1);
        if (!last) {
          continue;
        }
        const built = buildRunBatch({
          journal,
          fromSequence: last.sequence,
          onlySequence: last.sequence,
          batchId: this.createId(),
          exportedAt: this.clock.now(),
          source,
          maxEvents: 1,
          maxBytes: MAX_BATCH_BYTES,
        });
        if (typeof built !== "string") {
          return toPending(built);
        }
        if (built === "too_large") {
          return built;
        }
        if (built === "gap" || built === "unsupported") {
          blocked = built;
        }
      }
    }
    return blocked ?? "idle";
  }

  private async post(pending: PendingBatch): Promise<PostOutcome> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.requestTimeoutMs);
    this.abort = controller;
    try {
      const response = await this.fetchImpl(`${this.endpoint}/v1/telemetry/batches`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
          "Idempotency-Key": pending.batchId,
        },
        body: pending.body,
        signal: controller.signal,
      });
      const text = await response.text();
      return interpretResponse(response.status, text, pending);
    } catch {
      return { kind: "retry" };
    } finally {
      clearTimeout(timer);
      if (this.abort === controller) {
        this.abort = null;
      }
    }
  }

  private async countPending(
    installationId: string,
    destination: DestinationState,
  ): Promise<number> {
    if (!installationId) {
      return destination.pending ? 1 : 0;
    }
    let count = 0;
    const runs = await this.journal.listRuns();
    for (const listed of runs) {
      const journal = await this.journal.readJournal(listed.runId);
      if (!journal) {
        continue;
      }
      const maxSequence = journal.events.reduce((max, event) => Math.max(max, event.sequence), 0);
      const cursor = destination.cursors[listed.runId] ?? 0;
      count += Math.max(0, maxSequence - cursor);
    }
    return count;
  }

  private async ensureDocument(): Promise<TelemetryDocument> {
    if (this.document) {
      return this.document;
    }
    const stored = await this.state.load();
    if (stored) {
      this.document = stored;
      return stored;
    }
    const installationId = this.requestedInstallationId ?? this.createId();
    if (!isInstallationId(installationId)) {
      throw new Error("installation id is not a telemetry identifier.");
    }
    const created: TelemetryDocument = {
      version: 1,
      installationId,
      destinations: {},
    };
    await this.state.save(created);
    this.document = created;
    return created;
  }

  private async persist(
    document: TelemetryDocument,
    destinationKey: string,
    destination: DestinationState,
  ): Promise<void> {
    const next: TelemetryDocument = {
      version: 1,
      installationId: document.installationId,
      destinations: { ...document.destinations, [destinationKey]: destination },
    };
    await this.state.save(next);
    this.document = next;
  }

  private result(delivered: boolean): FlushResult {
    return { delivered, phase: this.phase, error: this.lastError };
  }

  private armTimer(): void {
    this.clearTimer();
    if (!this.active || this.stopped || this.intervalMs <= 0) {
      return;
    }
    this.timer = setTimeout(() => {
      void this.flush({ manual: false }).finally(() => {
        this.armTimer();
      });
    }, this.intervalMs);
  }

  private clearTimer(): void {
    clearTimeout(this.timer);
    this.timer = undefined;
  }
}

type PostOutcome =
  | { kind: "accepted"; acceptedThrough: number }
  | { kind: "partial"; acceptedThrough: number }
  | { kind: "rewind"; haveThroughSequence: number }
  | { kind: "unauthorized" }
  | { kind: "hold"; error: Exclude<TelemetryError, null> }
  | { kind: "malformed" }
  | { kind: "retry" };

function interpretResponse(status: number, text: string, pending: PendingBatch): PostOutcome {
  if (status === 401) {
    return { kind: "unauthorized" };
  }
  if (RETRYABLE.has(status) || status === 0) {
    return { kind: "retry" };
  }
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return status >= 200 && status < 300 ? { kind: "malformed" } : holdFor(status);
  }
  if (!isRecord(body)) {
    return status >= 200 && status < 300 ? { kind: "malformed" } : holdFor(status);
  }
  if (status === 409 && body["error"] === "sequence_gap") {
    const have = body["haveThroughSequence"];
    if (
      typeof have === "number" &&
      Number.isInteger(have) &&
      have >= 0 &&
      have + 1 < pending.fromSequence
    ) {
      return { kind: "rewind", haveThroughSequence: have };
    }
    return { kind: "hold", error: "sequence_gap" };
  }
  if (status === 409 && body["error"] === "history_conflict") {
    return { kind: "hold", error: "history_conflict" };
  }
  if (status === 400) {
    return { kind: "hold", error: "invalid_batch" };
  }
  if (status === 413) {
    return { kind: "hold", error: "batch_too_large" };
  }
  if (status === 422) {
    return { kind: "hold", error: "sensitive_payload" };
  }
  if (status < 200 || status >= 300) {
    return { kind: "retry" };
  }
  if (
    body["telemetryVersion"] !== 1 ||
    body["batchId"] !== pending.batchId ||
    !Array.isArray(body["results"])
  ) {
    return { kind: "malformed" };
  }
  const result = body["results"].find((item) => isRecord(item) && item["runId"] === pending.runId);
  if (!isRecord(result) || result["status"] !== "accepted") {
    return { kind: "malformed" };
  }
  const accepted = result["acceptedThroughSequence"];
  if (typeof accepted !== "number" || !Number.isInteger(accepted)) {
    return { kind: "malformed" };
  }
  if (accepted < pending.fromSequence) {
    return { kind: "malformed" };
  }
  if (accepted < pending.throughSequence) {
    return { kind: "partial", acceptedThrough: accepted };
  }
  return { kind: "accepted", acceptedThrough: accepted };
}

function holdFor(status: number): PostOutcome {
  if (status === 400) {
    return { kind: "hold", error: "invalid_batch" };
  }
  if (status === 413) {
    return { kind: "hold", error: "batch_too_large" };
  }
  if (status === 422) {
    return { kind: "hold", error: "sensitive_payload" };
  }
  return { kind: "retry" };
}

function toPending(built: BuiltBatch): PendingBatch {
  return {
    batchId: built.batchId,
    body: built.body,
    runId: built.runId,
    fromSequence: built.fromSequence,
    throughSequence: built.throughSequence,
    snapshotHash: built.snapshotHash,
  };
}

function backoffMs(attempt: number, max: number): number {
  const shift = Math.min(attempt - 1, 6);
  return Math.min(max, 1000 * 2 ** shift);
}

function asTelemetryError(value: string | null): TelemetryError {
  if (
    value === "unauthorized" ||
    value === "offline" ||
    value === "invalid_batch" ||
    value === "history_conflict" ||
    value === "sequence_gap" ||
    value === "batch_too_large" ||
    value === "sensitive_payload" ||
    value === "malformed_ack" ||
    value === "stopped" ||
    value === "unsupported"
  ) {
    return value;
  }
  return "offline";
}

async function destinationId(endpoint: string, apiKey: string): Promise<string> {
  const subtle = (globalThis as { crypto?: { subtle?: SubtleDigest } }).crypto?.subtle;
  if (!subtle) {
    throw new Error("crypto.subtle.digest is required to scope telemetry state.");
  }
  const encoded = new TextEncoder().encode(`${endpoint}\n${apiKey}`);
  const digest = await subtle.digest("SHA-256", encoded);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

interface SubtleDigest {
  digest(algorithm: "SHA-256", data: Uint8Array): Promise<ArrayBuffer>;
}

function randomUuid(): string {
  const cryptoApi = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (!cryptoApi?.randomUUID) {
    throw new Error("crypto.randomUUID is required to create telemetry identifiers.");
  }
  return cryptoApi.randomUUID();
}

function defaultFetch(
  url: string,
  init: {
    readonly method: "POST";
    readonly headers: Readonly<Record<string, string>>;
    readonly body: string;
    readonly signal: AbortSignal;
  },
): Promise<{ readonly status: number; text(): Promise<string> }> {
  const fetchImpl = (globalThis as { fetch?: TelemetryFetch }).fetch;
  if (!fetchImpl) {
    return Promise.reject(new Error("fetch is not available."));
  }
  return fetchImpl(url, init);
}

function compareRuns(
  left: { readonly runId: string; readonly updatedAt: number },
  right: { readonly runId: string; readonly updatedAt: number },
): number {
  if (left.updatedAt !== right.updatedAt) {
    return left.updatedAt - right.updatedAt;
  }
  if (left.runId < right.runId) {
    return -1;
  }
  if (left.runId > right.runId) {
    return 1;
  }
  return 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
