import {
  createCloudTelemetry,
  createMemoryTelemetryStore,
  nodeInstallationMetadata,
  reactNativeInstallationMetadata,
  type JournalDocument,
  type JournalEvent,
  type JournalStep,
  type TelemetryStateStore,
} from "@larkxai/telemetry";

import type { JsonValue } from "@larkxai/protocol";

export interface HostObservation {
  readonly source: "host";
  readonly type:
    | "runtime-initialized"
    | "runtime-closed"
    | "foreground"
    | "background"
    | "connectivity-lost"
    | "connectivity-restored";
  readonly timestamp: number;
}

export interface TelemetryDeliveryStatus {
  readonly enabled: boolean;
  readonly phase: "disabled" | "idle" | "pending" | "offline" | "unauthorized";
  readonly pendingEvents: number;
  readonly lastSyncedAt: number | null;
  readonly lastError: string | null;
  readonly installationId: string | null;
  readonly observations: readonly HostObservation[];
  readonly droppedObservations: number;
  /** True when more than the documented export window is still waiting in the journal. */
  readonly exportBehind: boolean;
}

export interface TelemetryExporter {
  start(): void;
  setActive?(active: boolean): void;
  flush(options?: { readonly manual?: boolean }): Promise<{
    readonly delivered: boolean;
    readonly phase: string;
    readonly error: string | null;
  }>;
  stop(): Promise<void>;
  current(): {
    readonly phase: string;
    readonly pendingEvents: number;
    readonly lastError: string | null;
    readonly lastSyncedAt: number | null;
    readonly installationId?: string | null;
  };
}

/** Technical labels a device may report. Hardware identifiers are not part of this type. */
export interface TelemetryInstallationMetadata {
  readonly appName?: string;
  readonly appVersion?: string;
  readonly platform?: string;
  readonly osName?: string;
  readonly osVersion?: string;
  readonly deviceModel?: string;
  readonly sdkVersion?: string;
}

/**
 * Durable export cursor. The Node and React Native SDKs provide one beside the
 * agent database. Callers do not need to construct the document.
 */
export interface TelemetryCursorStore {
  load(): Promise<unknown>;
  save(document: unknown): Promise<void>;
}

export interface LarkxCloudOptions {
  readonly projectId: string;
  readonly apiKey: string;
  /** Cloud origin. Defaults to `https://cloud.larkx.ai`. The client posts `/v1/telemetry/batches`. */
  readonly endpoint?: string;
  /** Defaults to `projectId`. Sent as `source.appId`. Cloud authorizes the ingestion key, not this field. */
  readonly appId?: string;
  readonly flushIntervalMs?: number;
  readonly batchSize?: number;
  readonly requestTimeoutMs?: number;
  readonly metadata?: TelemetryInstallationMetadata;
}

export interface LarkxCloudTelemetry extends LarkxCloudOptions {
  readonly kind: "larkx-cloud";
}

export type TelemetryConfig = LarkxCloudTelemetry | { readonly exporter: TelemetryExporter };

export function larkxCloud(options: LarkxCloudOptions): LarkxCloudTelemetry {
  return { kind: "larkx-cloud", ...options };
}

const OBSERVATION_LIMIT = 32;
const EXPORT_WINDOW = 2000;
const DEFAULT_ENDPOINT = "https://cloud.larkx.ai";

interface JournalCall {
  call(method: string, args: Record<string, JsonValue>): Promise<string>;
  now(): number;
  online(): boolean | Promise<boolean>;
}

interface SessionOptions {
  readonly config: TelemetryConfig;
  readonly state?: TelemetryCursorStore;
  readonly runtimeName: "node" | "react-native";
  readonly journal: JournalCall;
}

export class TelemetrySession {
  private readonly exporter: TelemetryExporter;
  private readonly journal: JournalCall;
  private readonly observations: HostObservation[] = [];
  private droppedObservations = 0;
  private lastOnline: boolean | null = null;

  constructor(options: SessionOptions) {
    this.journal = options.journal;
    this.exporter = openExporter(options);
  }

  start(): void {
    this.note("runtime-initialized");
    this.exporter.start();
  }

  setForeground(foreground: boolean): void {
    this.note(foreground ? "foreground" : "background");
    this.exporter.setActive?.(foreground);
  }

  async flush(): Promise<void> {
    await this.noteConnectivity();
    try {
      await this.exporter.flush({ manual: true });
    } catch {
      // Delivery never fails the caller.
    }
  }

  async stop(): Promise<void> {
    this.note("runtime-closed");
    try {
      await this.exporter.flush({ manual: true });
    } catch {
      // A failed final flush leaves the cursor where it was.
    }
    try {
      await this.exporter.stop();
    } catch {
      // Shutdown of the exporter is independent of the runtime close.
    }
  }

  status(): TelemetryDeliveryStatus {
    const current = this.exporter.current();
    const phase = current.phase;
    return {
      enabled: true,
      phase:
        phase === "idle" || phase === "pending" || phase === "offline" || phase === "unauthorized"
          ? phase
          : "pending",
      pendingEvents: current.pendingEvents,
      lastSyncedAt: current.lastSyncedAt,
      lastError: current.lastError,
      installationId: current.installationId ?? null,
      observations: [...this.observations],
      droppedObservations: this.droppedObservations,
      exportBehind: current.pendingEvents > EXPORT_WINDOW,
    };
  }

  private note(type: HostObservation["type"]): void {
    this.observations.push({ source: "host", type, timestamp: this.journalNow() });
    if (this.observations.length > OBSERVATION_LIMIT) {
      this.observations.shift();
      this.droppedObservations += 1;
    }
  }

  private journalNow(): number {
    return this.journal.now();
  }

  private async noteConnectivity(): Promise<void> {
    let online = true;
    try {
      online = await this.journal.online();
    } catch {
      online = false;
    }
    if (this.lastOnline !== null && this.lastOnline !== online) {
      this.note(online ? "connectivity-restored" : "connectivity-lost");
    }
    this.lastOnline = online;
  }
}

function openExporter(options: SessionOptions): TelemetryExporter {
  if ("exporter" in options.config) {
    return options.config.exporter;
  }
  const cloud = options.config;
  const projectId = cloud.projectId.trim();
  if (projectId.length === 0 || projectId.length > 80) {
    throw new Error("LarkX Cloud projectId must be 1-80 characters.");
  }
  const hooks = telemetryHooks();
  return createCloudTelemetry({
    endpoint: (cloud.endpoint ?? DEFAULT_ENDPOINT).replace(/\/+$/, ""),
    apiKey: cloud.apiKey,
    appId: cloud.appId ?? projectId,
    runtime: options.runtimeName,
    journal: {
      listRuns: () => listRuns(options.journal),
      readJournal: (runId) => readJournal(options.journal, runId),
    },
    state: (options.state as TelemetryStateStore | undefined) ?? createMemoryTelemetryStore(),
    metadata:
      cloud.metadata ??
      (options.runtimeName === "react-native"
        ? reactNativeInstallationMetadata({})
        : nodeInstallationMetadata()),
    intervalMs: cloud.flushIntervalMs ?? 15_000,
    ...(cloud.batchSize === undefined ? {} : { maxEvents: cloud.batchSize }),
    ...(cloud.requestTimeoutMs === undefined ? {} : { requestTimeoutMs: cloud.requestTimeoutMs }),
    fetch: async (url, init) => {
      let online = true;
      try {
        online = await options.journal.online();
      } catch {
        online = false;
      }
      if (!online) {
        return {
          status: 0,
          async text() {
            return "";
          },
        };
      }
      return defaultFetch(url, init);
    },
    ...(hooks.beforeRequest ? { beforeRequest: hooks.beforeRequest } : {}),
    ...(hooks.beforeCheckpoint ? { beforeCheckpoint: hooks.beforeCheckpoint } : {}),
  });
}

async function listRuns(
  journal: JournalCall,
): Promise<readonly { readonly runId: string; readonly updatedAt: number }[]> {
  const parsed = JSON.parse(await journal.call("listRuns", {})) as { runs?: unknown };
  if (!Array.isArray(parsed.runs)) {
    return [];
  }
  const runs = [];
  for (const entry of parsed.runs) {
    if (!isRecord(entry) || typeof entry.runId !== "string") {
      continue;
    }
    const updatedAt = entry.updatedAt;
    runs.push({
      runId: entry.runId,
      updatedAt: typeof updatedAt === "number" ? updatedAt : 0,
    });
  }
  return runs;
}

async function readJournal(journal: JournalCall, runId: string): Promise<JournalDocument | null> {
  let inspected: unknown;
  try {
    inspected = JSON.parse(await journal.call("inspect", { runId }));
  } catch {
    return null;
  }
  if (!isRecord(inspected) || typeof inspected.runId !== "string") {
    return null;
  }
  const events = await readEvents(journal, runId);
  const steps = await readSteps(journal, runId);
  const blocked =
    typeof inspected.blockedReason === "string" ? reasonCode(inspected.blockedReason) : null;
  const status = typeof inspected.status === "string" ? inspected.status : "RUNNING";
  return {
    run: {
      runId: inspected.runId,
      workflowName: typeof inspected.workflowName === "string" ? inspected.workflowName : "agent",
      workflowVersion: numberOf(inspected.workflowVersion),
      status: status as JournalDocument["run"]["status"],
      dataPolicy: inspected.dataPolicy === "cloud-allowed" ? "cloud-allowed" : "device-only",
      protocolVersion: numberOf(inspected.protocolVersion) || 1,
      createdAt: numberOf(inspected.createdAt),
      updatedAt: numberOf(inspected.updatedAt),
      cancelRequested: inspected.cancelRequested === true,
      ownershipEpoch: numberOf(inspected.ownershipEpoch),
      ownerPresent: inspected.hasOwner === true,
      errorCode: status === "FAILED" ? blocked : null,
      errorRetryable: null,
      blockedReasonCode: status === "BLOCKED" ? blocked : null,
    },
    steps,
    attempts: [],
    events,
  };
}

async function readEvents(journal: JournalCall, runId: string): Promise<JournalEvent[]> {
  const count = numberOf(JSON.parse(await journal.call("eventCount", { runId })));
  const events: JournalEvent[] = [];
  for (let index = 0; index < count; index += 1) {
    const parsed = JSON.parse(await journal.call("eventPayload", { runId, index })) as unknown;
    const event = projectEvent(runId, parsed);
    if (event) {
      events.push(event);
    }
  }
  return events;
}

function projectEvent(runId: string, value: unknown): JournalEvent | null {
  if (!isRecord(value) || typeof value.eventId !== "string" || typeof value.type !== "string") {
    return null;
  }
  if (typeof value.sequence !== "number" || !isRecord(value.payload)) {
    return null;
  }
  return {
    eventId: value.eventId,
    runId,
    sequence: value.sequence,
    type: value.type as JournalEvent["type"],
    createdAt: numberOf(value.createdAt),
    payload: value.payload as JournalEvent["payload"],
  };
}

async function readSteps(journal: JournalCall, runId: string): Promise<JournalStep[]> {
  const count = numberOf(JSON.parse(await journal.call("stepCount", { runId })));
  const steps: JournalStep[] = [];
  for (let index = 0; index < count; index += 1) {
    const parsed = JSON.parse(await journal.call("stepAt", { runId, index })) as unknown;
    if (!isRecord(parsed) || typeof parsed.stepKey !== "string") {
      continue;
    }
    const execution =
      parsed.executionTarget === "hybrid" || parsed.executionTarget === "cloud"
        ? parsed.executionTarget
        : "local";
    const effect =
      parsed.effectType === "idempotent" || parsed.effectType === "non-idempotent"
        ? parsed.effectType
        : "pure";
    steps.push({
      runId,
      stepKey: parsed.stepKey,
      stepOrder: numberOf(parsed.stepOrder),
      status: typeof parsed.status === "string" ? parsed.status : "PENDING",
      executionTarget: execution,
      selectedTarget: parsed.selectedTarget === "cloud" ? "cloud" : "local",
      effectType: effect,
      attemptCount: numberOf(parsed.attemptCount),
      operationId: typeof parsed.operationId === "string" ? parsed.operationId : "",
      descriptor: { effects: effect, execution, timeoutMs: null },
      nextAttemptAt: null,
      errorCode: null,
      errorRetryable: null,
      createdAt: 0,
      updatedAt: 0,
    });
  }
  return steps;
}

function reasonCode(text: string): string | null {
  if (!text.startsWith("{")) {
    return null;
  }
  try {
    const parsed = JSON.parse(text) as { code?: unknown };
    if (typeof parsed.code === "string" && /^[a-z0-9_]{1,80}$/.test(parsed.code)) {
      return parsed.code;
    }
  } catch {
    return null;
  }
  return null;
}

function numberOf(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function telemetryHooks(): {
  beforeRequest?: () => void | Promise<void>;
  beforeCheckpoint?: () => void | Promise<void>;
} {
  const hooks = (
    globalThis as {
      __larkxTelemetryHooks?: {
        beforeRequest?: () => void | Promise<void>;
        beforeCheckpoint?: () => void | Promise<void>;
      };
    }
  ).__larkxTelemetryHooks;
  return hooks ?? {};
}

async function defaultFetch(
  url: string,
  init: {
    readonly method: "POST";
    readonly headers: Readonly<Record<string, string>>;
    readonly body: string;
    readonly signal: AbortSignal;
  },
): Promise<{ readonly status: number; text(): Promise<string> }> {
  const response = await fetch(url, init);
  return { status: response.status, text: () => response.text() };
}

export function disabledTelemetryStatus(): TelemetryDeliveryStatus {
  return {
    enabled: false,
    phase: "disabled",
    pendingEvents: 0,
    lastSyncedAt: null,
    lastError: null,
    installationId: null,
    observations: [],
    droppedObservations: 0,
    exportBehind: false,
  };
}
