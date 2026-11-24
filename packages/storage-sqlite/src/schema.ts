import { LarkxError } from "@larkxai/protocol";

import type { SqliteDriver } from "./driver.js";

/** Storage schema version. Independent of protocol and workflow definition versions. */
export const STORAGE_SCHEMA_VERSION = 1;

const MIGRATION_V1 = `
CREATE TABLE workflow_runs (
  run_id TEXT PRIMARY KEY,
  workflow_name TEXT NOT NULL,
  workflow_version INTEGER NOT NULL,
  input_json TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('CREATED','RUNNING','WAITING','RECOVERING','COMPLETED','FAILED','CANCELLED','BLOCKED')),
  output_json TEXT,
  error_json TEXT,
  blocked_reason TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  owner_id TEXT,
  ownership_epoch INTEGER NOT NULL,
  lease_expires_at INTEGER,
  protocol_version INTEGER NOT NULL,
  data_policy TEXT NOT NULL CHECK (data_policy IN ('device-only','cloud-allowed')),
  cancel_requested INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE workflow_steps (
  run_id TEXT NOT NULL,
  step_key TEXT NOT NULL,
  step_order INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('PENDING','RUNNING','WAITING_REMOTE','RETRY_SCHEDULED','COMPLETED','FAILED','UNKNOWN_OUTCOME','CANCELLED')),
  execution_target TEXT NOT NULL,
  selected_target TEXT NOT NULL,
  effect_type TEXT NOT NULL,
  attempt_count INTEGER NOT NULL,
  input_json TEXT,
  output_json TEXT,
  error_json TEXT,
  operation_id TEXT NOT NULL,
  descriptor_json TEXT NOT NULL,
  next_attempt_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (run_id, step_key),
  UNIQUE (run_id, step_order),
  FOREIGN KEY (run_id) REFERENCES workflow_runs(run_id)
);

CREATE TABLE step_attempts (
  attempt_id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  step_key TEXT NOT NULL,
  attempt_number INTEGER NOT NULL,
  execution_target TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('STARTED','COMPLETED','FAILED','INTERRUPTED','CANCELLED')),
  started_at INTEGER NOT NULL,
  completed_at INTEGER,
  error_json TEXT,
  UNIQUE (run_id, step_key, attempt_number),
  FOREIGN KEY (run_id, step_key) REFERENCES workflow_steps(run_id, step_key)
);

CREATE TABLE workflow_events (
  event_id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  sequence INTEGER NOT NULL,
  event_type TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  UNIQUE (run_id, sequence),
  FOREIGN KEY (run_id) REFERENCES workflow_runs(run_id)
);

CREATE TABLE outbox (
  message_id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  step_key TEXT NOT NULL,
  operation_id TEXT NOT NULL UNIQUE,
  payload_json TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending','accepted','delivered','failed')),
  attempt_count INTEGER NOT NULL,
  next_attempt_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (run_id) REFERENCES workflow_runs(run_id)
);

CREATE TABLE artifacts (
  artifact_id TEXT PRIMARY KEY,
  local_uri TEXT NOT NULL,
  remote_reference TEXT,
  content_hash TEXT NOT NULL,
  content_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX idx_workflow_runs_status ON workflow_runs(status);
CREATE INDEX idx_workflow_events_run ON workflow_events(run_id, sequence);
`;

export function migrate(driver: SqliteDriver): void {
  driver.exec("PRAGMA foreign_keys = ON;");
  try {
    driver.exec("PRAGMA journal_mode = WAL;");
  } catch {
    // Some in-memory or restricted SQLite builds reject WAL. Rollback mode still provides transactions.
  }
  driver.exec("PRAGMA busy_timeout = 5000;");
  driver.exec("PRAGMA synchronous = NORMAL;");
  driver.transaction(() => {
    driver.exec(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY,
        applied_at INTEGER NOT NULL
      );
    `);
    const current = driver.get<{ version: number }>(
      "SELECT version FROM schema_migrations ORDER BY version DESC LIMIT 1",
    );
    const version = current?.version ?? 0;
    if (version > STORAGE_SCHEMA_VERSION) {
      throw new LarkxError({
        code: "storage_failure",
        message: `Database schema ${String(version)} is newer than storage schema ${String(STORAGE_SCHEMA_VERSION)}.`,
        retryable: false,
      });
    }
    if (version < 1) {
      driver.exec(MIGRATION_V1);
      driver.run("INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)", [
        1,
        Date.now(),
      ]);
    }
  });
}
