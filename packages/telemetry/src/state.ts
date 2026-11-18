import type { SqliteDriver } from "@larkx/storage-sqlite";

export interface PendingBatch {
  readonly batchId: string;
  readonly body: string;
  readonly runId: string;
  readonly fromSequence: number;
  readonly throughSequence: number;
  readonly snapshotHash: string;
}

export interface DestinationState {
  readonly cursors: Readonly<Record<string, number>>;
  readonly snapshots: Readonly<Record<string, string>>;
  readonly pending: PendingBatch | null;
  readonly backoffAttempt: number;
  readonly nextAttemptAt: number;
  readonly authBlocked: boolean;
  readonly hold: string | null;
  readonly lastSyncedAt: number | null;
  readonly lastError: string | null;
}

export interface TelemetryDocument {
  readonly version: 1;
  readonly installationId: string;
  readonly destinations: Readonly<Record<string, DestinationState>>;
}

export interface TelemetryStateStore {
  load(): Promise<TelemetryDocument | null>;
  save(document: TelemetryDocument): Promise<void>;
}

export function emptyDestination(): DestinationState {
  return {
    cursors: {},
    snapshots: {},
    pending: null,
    backoffAttempt: 0,
    nextAttemptAt: 0,
    authBlocked: false,
    hold: null,
    lastSyncedAt: null,
    lastError: null,
  };
}

export function createMemoryTelemetryStore(): TelemetryStateStore {
  let document: TelemetryDocument | null = null;
  return {
    async load() {
      return document === null ? null : cloneDocument(document);
    },
    async save(next) {
      document = cloneDocument(next);
    },
  };
}

export function createSqliteTelemetryStore(driver: SqliteDriver): TelemetryStateStore {
  driver.exec(`
    CREATE TABLE IF NOT EXISTS larkx_telemetry_state (
      slot INTEGER PRIMARY KEY CHECK (slot = 1),
      document_json TEXT NOT NULL
    );
  `);
  return {
    async load() {
      const row = driver.get<{ document_json: string }>(
        "SELECT document_json FROM larkx_telemetry_state WHERE slot = 1",
      );
      if (!row) {
        return null;
      }
      return parseDocument(row.document_json);
    },
    async save(document) {
      const json = JSON.stringify(document);
      driver.transaction(() => {
        driver.run(
          `INSERT INTO larkx_telemetry_state (slot, document_json) VALUES (1, ?)
           ON CONFLICT(slot) DO UPDATE SET document_json = excluded.document_json`,
          [json],
        );
      });
    },
  };
}

export function parseDocument(encoded: string): TelemetryDocument | null {
  let value: unknown;
  try {
    value = JSON.parse(encoded);
  } catch {
    return null;
  }
  if (!isRecord(value) || value["version"] !== 1 || typeof value["installationId"] !== "string") {
    return null;
  }
  if (!isInstallationId(value["installationId"])) {
    return null;
  }
  const destinations: Record<string, DestinationState> = {};
  const rawDestinations = value["destinations"];
  if (isRecord(rawDestinations)) {
    for (const [key, candidate] of Object.entries(rawDestinations)) {
      const parsed = parseDestination(candidate);
      if (parsed) {
        destinations[key] = parsed;
      }
    }
  }
  return {
    version: 1,
    installationId: value["installationId"],
    destinations,
  };
}

function parseDestination(value: unknown): DestinationState | null {
  if (!isRecord(value)) {
    return null;
  }
  const pending = value["pending"];
  return {
    cursors: numberMap(value["cursors"]),
    snapshots: stringMap(value["snapshots"]),
    pending: parsePending(pending),
    backoffAttempt: nonNegative(value["backoffAttempt"]),
    nextAttemptAt: nonNegative(value["nextAttemptAt"]),
    authBlocked: value["authBlocked"] === true,
    hold: typeof value["hold"] === "string" ? value["hold"] : null,
    lastSyncedAt: value["lastSyncedAt"] === null ? null : nonNegativeOrNull(value["lastSyncedAt"]),
    lastError: typeof value["lastError"] === "string" ? value["lastError"] : null,
  };
}

function parsePending(value: unknown): PendingBatch | null {
  if (!isRecord(value)) {
    return null;
  }
  if (
    typeof value["batchId"] !== "string" ||
    typeof value["body"] !== "string" ||
    typeof value["runId"] !== "string" ||
    typeof value["snapshotHash"] !== "string"
  ) {
    return null;
  }
  const fromSequence = value["fromSequence"];
  const throughSequence = value["throughSequence"];
  if (!isPositiveInteger(fromSequence) || !isPositiveInteger(throughSequence)) {
    return null;
  }
  if (throughSequence < fromSequence) {
    return null;
  }
  return {
    batchId: value["batchId"],
    body: value["body"],
    runId: value["runId"],
    fromSequence,
    throughSequence,
    snapshotHash: value["snapshotHash"],
  };
}

function cloneDocument(document: TelemetryDocument): TelemetryDocument {
  const parsed = parseDocument(JSON.stringify(document));
  if (!parsed) {
    throw new Error("Telemetry state could not be stored.");
  }
  return parsed;
}

function numberMap(value: unknown): Record<string, number> {
  if (!isRecord(value)) {
    return {};
  }
  const result: Record<string, number> = {};
  for (const [key, item] of Object.entries(value)) {
    if (isNonNegativeInteger(item)) {
      result[key] = item;
    }
  }
  return result;
}

function stringMap(value: unknown): Record<string, string> {
  if (!isRecord(value)) {
    return {};
  }
  const result: Record<string, string> = {};
  for (const [key, item] of Object.entries(value)) {
    if (typeof item === "string") {
      result[key] = item;
    }
  }
  return result;
}

function nonNegative(value: unknown): number {
  return isNonNegativeInteger(value) ? value : 0;
}

function nonNegativeOrNull(value: unknown): number | null {
  return isNonNegativeInteger(value) ? value : null;
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 1;
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

export function isInstallationId(value: string): boolean {
  if (value.length < 1 || value.length > 200) {
    return false;
  }
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code <= 32 || code === 127) {
      return false;
    }
  }
  return true;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
