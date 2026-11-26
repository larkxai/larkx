export interface TelemetrySql {
  exec(sql: string): void;
  get<T>(sql: string, params?: readonly unknown[]): T | null | undefined;
  run(sql: string, params?: readonly unknown[]): void;
  transaction(work: () => void): void;
}

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
  readonly observedAt: Readonly<Record<string, number>>;
  /**
   * Runs that already had events when this destination was authorized.
   * Their history is not exported. A later sequence would be a gap in the version 1 contract.
   */
  readonly sealedRuns: readonly string[];
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
  /** Increases by one on every successful store. Writers pass the revision they read. */
  readonly revision: number;
  readonly installationId: string;
  readonly destinations: Readonly<Record<string, DestinationState>>;
}

export interface TelemetryStateStore {
  load(): Promise<TelemetryDocument | null>;
  /**
   * Writes `document` when the stored revision is `expectedRevision`.
   * `document.revision` must be `expectedRevision + 1`.
   * Returns false when another writer stored a different revision. The cursor is unchanged.
   */
  save(document: TelemetryDocument, expectedRevision: number): Promise<boolean>;
}

export function emptyDestination(): DestinationState {
  return {
    cursors: {},
    snapshots: {},
    observedAt: {},
    sealedRuns: [],
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
  let tail: Promise<void> = Promise.resolve();
  const exclusive = async <T>(work: () => T): Promise<T> => {
    const previous = tail;
    let release: () => void = () => undefined;
    tail = new Promise((resolve) => {
      release = resolve;
    });
    await previous;
    try {
      return work();
    } finally {
      release();
    }
  };
  return {
    async load() {
      return exclusive(() => (document === null ? null : cloneDocument(document)));
    },
    async save(next, expectedRevision) {
      return exclusive(() => {
        const currentRevision = document?.revision ?? 0;
        if (currentRevision !== expectedRevision || next.revision !== expectedRevision + 1) {
          return false;
        }
        document = cloneDocument(next);
        return true;
      });
    },
  };
}

export function createSqliteTelemetryStore(driver: TelemetrySql): TelemetryStateStore {
  driver.exec(`
    CREATE TABLE IF NOT EXISTS larkx_telemetry_state (
      slot INTEGER PRIMARY KEY CHECK (slot = 1),
      document_json TEXT NOT NULL
    );
  `);
  let tail: Promise<void> = Promise.resolve();
  const exclusive = async <T>(work: () => T): Promise<T> => {
    const previous = tail;
    let release: () => void = () => undefined;
    tail = new Promise((resolve) => {
      release = resolve;
    });
    await previous;
    try {
      return work();
    } finally {
      release();
    }
  };
  const readRow = (): TelemetryDocument | null => {
    const row = driver.get<{ document_json: string }>(
      "SELECT document_json FROM larkx_telemetry_state WHERE slot = 1",
    );
    if (!row) {
      return null;
    }
    return parseDocument(row.document_json);
  };
  return {
    async load() {
      return exclusive(() => readRow());
    },
    async save(document, expectedRevision) {
      return exclusive(() => {
        if (document.revision !== expectedRevision + 1) {
          return false;
        }
        driver.exec("BEGIN IMMEDIATE");
        try {
          const current = readRow();
          const currentRevision = current?.revision ?? 0;
          if (currentRevision !== expectedRevision) {
            driver.exec("ROLLBACK");
            return false;
          }
          driver.run(
            `INSERT INTO larkx_telemetry_state (slot, document_json) VALUES (1, ?)
             ON CONFLICT(slot) DO UPDATE SET document_json = excluded.document_json`,
            [JSON.stringify(document)],
          );
          driver.exec("COMMIT");
          return true;
        } catch (error) {
          try {
            driver.exec("ROLLBACK");
          } catch {
            // The original error is the one the caller needs.
          }
          throw error;
        }
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
  const revision = value["revision"];
  return {
    version: 1,
    revision: isNonNegativeInteger(revision) ? revision : 0,
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
    observedAt: numberMap(value["observedAt"]),
    sealedRuns: stringList(value["sealedRuns"]),
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

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const result: string[] = [];
  for (const item of value) {
    if (typeof item === "string" && item.length > 0 && item.length <= 200) {
      result.push(item);
    }
  }
  return result;
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
