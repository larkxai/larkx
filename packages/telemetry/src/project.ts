import type { JournalDocument } from "@larkx/core";
import {
  EVENT_TYPES,
  SENSITIVE_EVENT_KEYS,
  type EventType,
  type JsonObject,
  type JsonValue,
} from "@larkx/protocol";
import { STORAGE_SCHEMA_VERSION } from "@larkx/storage-sqlite";

export const TELEMETRY_VERSION = 1 as const;
export const MAX_BATCH_EVENTS = 500;
export const MAX_BATCH_BYTES = 256 * 1024;

const SENSITIVE = new Set<string>(SENSITIVE_EVENT_KEYS);

/**
 * Keys the engine already writes. Anything else, including a future field that
 * might carry a prompt or a tool argument, stays on the device.
 */
const ALLOWED_PAYLOAD_KEYS: Record<EventType, readonly string[]> = {
  WORKFLOW_CREATED: ["workflowName", "workflowVersion", "protocolVersion", "dataPolicy"],
  WORKFLOW_STARTED: ["workflowName", "workflowVersion", "resumed", "stepKey", "resolution"],
  WORKFLOW_RECOVERED: ["from"],
  WORKFLOW_WAITING: [],
  WORKFLOW_BLOCKED: ["code", "stepKey"],
  STEP_STARTED: ["effects", "execution", "operationId", "stepKey"],
  STEP_COMPLETED: ["attempt", "effects", "execution", "stepKey"],
  STEP_FAILED: ["attemptStatus", "code", "stepKey"],
  STEP_RETRY_SCHEDULED: ["effects", "reason", "stepKey", "attemptStatus", "code"],
  STEP_OUTCOME_UNKNOWN: ["effects", "reason", "stepKey"],
  STEP_RECONCILED: ["stepKey", "resolution"],
  REMOTE_DISPATCH_QUEUED: [],
  REMOTE_DISPATCH_ACCEPTED: [],
  REMOTE_RESULT_RECEIVED: [],
  WORKFLOW_COMPLETED: [],
  WORKFLOW_FAILED: ["code", "stepKey", "resolution"],
  WORKFLOW_CANCELLED: ["reason"],
};

const EVENT_TYPE_SET = new Set<string>(EVENT_TYPES);

export interface TelemetrySource {
  readonly installationId: string;
  readonly appId: string;
  readonly runtime: "node" | "react-native";
}

export interface BuiltBatch {
  readonly batchId: string;
  readonly body: string;
  readonly runId: string;
  readonly fromSequence: number;
  readonly throughSequence: number;
  readonly snapshotHash: string;
}

export type BuildFailure = "empty" | "gap" | "too_large" | "unsupported";

export function allowEventPayload(type: string, payload: JsonObject): JsonObject | null {
  if (!EVENT_TYPE_SET.has(type)) {
    return null;
  }
  const allowed = ALLOWED_PAYLOAD_KEYS[type as EventType];
  const next: { [key: string]: JsonValue } = {};
  for (const key of allowed) {
    if (SENSITIVE.has(key) || !Object.prototype.hasOwnProperty.call(payload, key)) {
      continue;
    }
    const value = payload[key];
    if (!isScalar(value)) {
      continue;
    }
    next[key] = value;
  }
  return next;
}

export function snapshotHash(journal: JournalDocument): string {
  return stableStringify({
    run: journal.run,
    steps: journal.steps,
    attempts: journal.attempts,
  });
}

export function buildRunBatch(input: {
  readonly journal: JournalDocument;
  readonly fromSequence: number;
  readonly batchId: string;
  readonly exportedAt: number;
  readonly source: TelemetrySource;
  readonly maxEvents: number;
  readonly maxBytes: number;
  readonly onlySequence?: number;
}): BuiltBatch | BuildFailure {
  const run = input.journal.run;
  if (run.protocolVersion !== 1 || !isSafeName(run.workflowName)) {
    return "unsupported";
  }
  const ordered = [...input.journal.events].sort((left, right) => left.sequence - right.sequence);
  if (ordered.length === 0) {
    return "empty";
  }
  const selected =
    input.onlySequence === undefined
      ? ordered.filter((event) => event.sequence >= input.fromSequence)
      : ordered.filter((event) => event.sequence === input.onlySequence);
  if (selected.length === 0) {
    return "empty";
  }
  if (input.onlySequence === undefined && selected[0]?.sequence !== input.fromSequence) {
    return "gap";
  }
  const limit = Math.max(1, Math.min(input.maxEvents, MAX_BATCH_EVENTS));
  let count = Math.min(selected.length, limit);
  let built: BuiltBatch | null = null;
  while (count >= 1) {
    const slice = selected.slice(0, count);
    const projected = projectEvents(run.runId, slice);
    if (!projected) {
      return "unsupported";
    }
    const throughSequence = projected[projected.length - 1]?.sequence;
    const fromSequence = projected[0]?.sequence;
    if (throughSequence === undefined || fromSequence === undefined) {
      return "empty";
    }
    const body = stableStringify({
      telemetryVersion: TELEMETRY_VERSION,
      protocolVersion: 1,
      storageSchemaVersion: STORAGE_SCHEMA_VERSION,
      batchId: input.batchId,
      exportedAt: input.exportedAt,
      mode: "metadata-only",
      source: {
        installationId: input.source.installationId,
        appId: input.source.appId,
        runtime: input.source.runtime,
      },
      runs: [
        {
          ...run,
          fromSequence,
          throughSequence,
          steps: input.journal.steps,
          attempts: input.journal.attempts,
          events: projected,
        },
      ],
    });
    if (utf8Size(body) <= input.maxBytes) {
      built = {
        batchId: input.batchId,
        body,
        runId: run.runId,
        fromSequence,
        throughSequence,
        snapshotHash: snapshotHash(input.journal),
      };
      break;
    }
    count -= 1;
  }
  if (!built) {
    return "too_large";
  }
  return built;
}

function projectEvents(
  runId: string,
  events: JournalDocument["events"],
): Array<{
  eventId: string;
  runId: string;
  sequence: number;
  type: string;
  payload: JsonObject;
  createdAt: number;
}> | null {
  const projected = [];
  for (const event of events) {
    const payload = allowEventPayload(event.type, event.payload);
    if (!payload) {
      return null;
    }
    projected.push({
      eventId: event.eventId,
      runId,
      sequence: event.sequence,
      type: event.type,
      payload,
      createdAt: event.createdAt,
    });
  }
  return projected;
}

export function stableStringify(value: unknown): string {
  return JSON.stringify(sortValue(value));
}

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => sortValue(item));
  }
  if (!isRecord(value)) {
    return value;
  }
  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(value).sort()) {
    sorted[key] = sortValue(value[key]);
  }
  return sorted;
}

function utf8Size(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

function isScalar(value: JsonValue | undefined): value is JsonValue {
  if (value === undefined) {
    return false;
  }
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return true;
  }
  return typeof value === "number" && Number.isFinite(value);
}

function isSafeName(value: string): boolean {
  return /^[a-z][a-z0-9-]{0,63}$/.test(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
