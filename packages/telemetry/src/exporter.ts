import type { Engine, JournalDocument } from "@larkx/core";

import { sanitizeInstallationMetadata, type InstallationMetadata } from "./metadata.js";
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
  /**
   * Optional technical metadata for this app installation.
   * Omit a field the platform did not report. Do not pass a serial number,
   * advertising id, or other permanent hardware identifier. A thrown provider
   * is ignored so the journal can still be exported.
   */
  readonly metadata?:
    InstallationMetadata | (() => InstallationMetadata | Promise<InstallationMetadata>);
  /** Used only when this store does not already have an installation id. */
  readonly installationId?: string;
  readonly clock?: { now(): number };
  readonly createId?: () => string;
  /**
   * SHA-256 of the given bytes, as lowercase hex.
   * Hermes has no `crypto.subtle`. Pass `expo-crypto` from a React Native app.
   * When omitted, the exporter uses Web Crypto and then its own SHA-256.
   */
  readonly sha256?: (data: Uint8Array) => Promise<string>;
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
  private readonly metadata: CloudTelemetryOptions["metadata"];
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
    this.metadata = options.metadata;
    this.requestedInstallationId = options.installationId ?? null;
    this.clock = options.clock ?? { now: () => Date.now() };
    this.createId = options.createId ?? randomUuid;
    this.intervalMs = options.intervalMs ?? 15_000;
    this.maxEvents = Math.max(1, Math.min(options.maxEvents ?? 100, MAX_BATCH_EVENTS));
    this.requestTimeoutMs = options.requestTimeoutMs ?? 10_000;
    this.maxBackoffMs = options.maxBackoffMs ?? 60_000;
    this.fetchImpl = options.fetch ?? defaultFetch;
    this.destinationIdPromise = destinationId(this.endpoint, this.apiKey, options.sha256);
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
    const metadata = await this.readMetadata();
    let blocked: "gap" | "unsupported" | null = null;
    for (const listed of runs) {
      const journal = await this.journal.readJournal(listed.runId);
      if (!journal || journal.events.length === 0) {
        continue;
      }
      const maxSequence = journal.events.reduce((max, event) => Math.max(max, event.sequence), 0);
      const cursor = destination.cursors[listed.runId] ?? 0;
      const hash = snapshotHash(journal);
      const source: TelemetrySource = { ...this.sourceBase, installationId, ...metadata };
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

  private async readMetadata(): Promise<InstallationMetadata> {
    try {
      const raw =
        typeof this.metadata === "function" ? await this.metadata() : (this.metadata ?? {});
      return sanitizeInstallationMetadata(raw);
    } catch {
      return {};
    }
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

async function destinationId(
  endpoint: string,
  apiKey: string,
  sha256?: (data: Uint8Array) => Promise<string>,
): Promise<string> {
  const encoded = new TextEncoder().encode(`${endpoint}\n${apiKey}`);
  if (sha256) {
    return sha256(encoded);
  }
  const subtle = (globalThis as { crypto?: { subtle?: SubtleDigest } }).crypto?.subtle;
  if (subtle) {
    const digest = await subtle.digest("SHA-256", encoded);
    return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  }
  return sha256Hex(encoded);
}

interface SubtleDigest {
  digest(algorithm: "SHA-256", data: Uint8Array): Promise<ArrayBuffer>;
}

function randomUuid(): string {
  const cryptoApi = (
    globalThis as {
      crypto?: { randomUUID?: () => string; getRandomValues?: (bytes: Uint8Array) => Uint8Array };
    }
  ).crypto;
  if (typeof cryptoApi?.randomUUID === "function") {
    return cryptoApi.randomUUID();
  }
  if (typeof cryptoApi?.getRandomValues !== "function") {
    throw new Error(
      "crypto.randomUUID or crypto.getRandomValues is required to create telemetry identifiers.",
    );
  }
  const bytes = new Uint8Array(16);
  cryptoApi.getRandomValues(bytes);
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function rotr(value: number, bits: number): number {
  return ((value >>> bits) | (value << (32 - bits))) >>> 0;
}

/** SHA-256 for Hermes, which has no `crypto.subtle`. */
function sha256Hex(message: Uint8Array): string {
  const k = new Uint32Array([
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
  ]);
  const bitLength = message.length * 8;
  const withOne = message.length + 1;
  const zeros = (64 - ((withOne + 8) % 64)) % 64;
  const data = new Uint8Array(withOne + zeros + 8);
  data.set(message);
  data[message.length] = 0x80;
  const view = new DataView(data.buffer);
  view.setUint32(data.length - 8, Math.floor(bitLength / 0x100000000));
  view.setUint32(data.length - 4, bitLength >>> 0);

  let h0 = 0x6a09e667;
  let h1 = 0xbb67ae85;
  let h2 = 0x3c6ef372;
  let h3 = 0xa54ff53a;
  let h4 = 0x510e527f;
  let h5 = 0x9b05688c;
  let h6 = 0x1f83d9ab;
  let h7 = 0x5be0cd19;
  const w = new Uint32Array(64);
  for (let offset = 0; offset < data.length; offset += 64) {
    for (let index = 0; index < 16; index += 1) {
      w[index] = view.getUint32(offset + index * 4);
    }
    for (let index = 16; index < 64; index += 1) {
      const s0 = rotr(w[index - 15]!, 7) ^ rotr(w[index - 15]!, 18) ^ (w[index - 15]! >>> 3);
      const s1 = rotr(w[index - 2]!, 17) ^ rotr(w[index - 2]!, 19) ^ (w[index - 2]! >>> 10);
      w[index] = (w[index - 16]! + s0 + w[index - 7]! + s1) >>> 0;
    }
    let a = h0;
    let b = h1;
    let c = h2;
    let d = h3;
    let e = h4;
    let f = h5;
    let g = h6;
    let h = h7;
    for (let index = 0; index < 64; index += 1) {
      const s1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const temp1 = (h + s1 + ch + k[index]! + w[index]!) >>> 0;
      const s0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (s0 + maj) >>> 0;
      h = g;
      g = f;
      f = e;
      e = (d + temp1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) >>> 0;
    }
    h0 = (h0 + a) >>> 0;
    h1 = (h1 + b) >>> 0;
    h2 = (h2 + c) >>> 0;
    h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0;
    h5 = (h5 + f) >>> 0;
    h6 = (h6 + g) >>> 0;
    h7 = (h7 + h) >>> 0;
  }
  return [h0, h1, h2, h3, h4, h5, h6, h7]
    .map((word) => word.toString(16).padStart(8, "0"))
    .join("");
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
