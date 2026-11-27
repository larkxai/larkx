import {
  createRuntime as openHostRuntime,
  sqlite as sqliteFile,
  type CreateRuntimeOptions,
  type Runtime,
  type SqliteStorage,
} from "@larkxai/host";
import { createRequire } from "node:module";

import { createSqliteTelemetryStore, type TelemetrySql } from "@larkxai/telemetry";

import { createNodeTransport } from "./node-client.js";
import { createNodeSecureHttp } from "./secure-http.js";

export {
  bindNativeAppState,
  defineTool,
  remoteAgent,
  scriptedModel,
  ToolFailure,
  type Agent,
  type AgentOptions,
  type DelegationView,
  type RemoteAgent,
  A2A_PROTOCOL_VERSION,
  A2A_REMOTE_CAPABILITIES,
  type RemoteA2aTransport,
  type RemoteCapabilities,
  type RemoteHttpTransport,
  type RemoteTransport,
  type AgentResult,
  type HistoryEvent,
  type HistoryStep,
  type HostEvent,
  type JsonSchema,
  type Model,
  type ModelContext,
  type ModelRequest,
  type ModelResponse,
  type ReconcileInput,
  type ResumeOptions,
  type RetryPolicy,
  type Run,
  type RunHistory,
  type RunStatus,
  type Runtime,
  type RuntimeDiagnostics,
  type RuntimeVersions,
  type ScriptedModel,
  type SqliteStorage,
  type StartInput,
  type TelemetryConfig,
  type TelemetryDeliveryStatus,
  type TelemetryExporter,
  type Tool,
  type ToolCall,
  type ToolContext,
} from "@larkxai/host";

export { larkxCloud } from "@larkxai/host";
export { createNodeTransport } from "./node-client.js";
export { createNodeSecureHttp } from "./secure-http.js";

const telemetryDatabases = new Map<string, SqliteDatabase>();

export function sqlite(path: string): SqliteStorage {
  return sqliteFile(path);
}

export async function createRuntime(
  options: Omit<CreateRuntimeOptions, "transport"> & {
    readonly transport?: CreateRuntimeOptions["transport"];
  },
): Promise<Runtime> {
  const telemetryState =
    options.telemetry !== undefined && options.telemetryState === undefined
      ? openTelemetryState(options.storage.path)
      : options.telemetryState;
  return openHostRuntime({
    ...options,
    runtimeName: options.runtimeName ?? "node",
    ...(telemetryState !== undefined ? { telemetryState } : {}),
    ...(options.http === undefined ? { http: createNodeSecureHttp() } : {}),
    transport: options.transport ?? createNodeTransport(),
  });
}

function openTelemetryState(path: string) {
  const file = `${path}.telemetry`;
  let database = telemetryDatabases.get(file);
  if (database === undefined) {
    database = new SqliteDatabase(file);
    telemetryDatabases.set(file, database);
  }
  return createSqliteTelemetryStore(
    sqliteDriver(database),
  ) as CreateRuntimeOptions["telemetryState"];
}

interface SqliteDatabase {
  exec(sql: string): void;
  prepare(sql: string): {
    get(...params: readonly unknown[]): unknown;
    run(...params: readonly unknown[]): unknown;
  };
}

const SqliteDatabase = loadSqliteDatabase();

function loadSqliteDatabase(): new (path: string) => SqliteDatabase {
  const specifier = "node:" + "sqlite";
  const loaded = requireSqlite(specifier) as { DatabaseSync: new (path: string) => SqliteDatabase };
  return loaded.DatabaseSync;
}

function requireSqlite(specifier: string): unknown {
  const require = createRequire(import.meta.url);
  return require(specifier);
}

function sqliteDriver(database: SqliteDatabase): TelemetrySql {
  return {
    exec(sql) {
      database.exec(sql);
    },
    get(sql, params = []) {
      return database.prepare(sql).get(...(params as never[])) as never;
    },
    run(sql, params = []) {
      database.prepare(sql).run(...(params as never[]));
    },
    transaction(work) {
      database.exec("BEGIN");
      try {
        work();
        database.exec("COMMIT");
      } catch (error) {
        database.exec("ROLLBACK");
        throw error;
      }
    },
  };
}
