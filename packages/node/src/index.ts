import {
  createRuntime as openHostRuntime,
  sqlite as sqliteFile,
  type CreateRuntimeOptions,
  type Runtime,
  type SqliteStorage,
} from "@larkxai/host";

import { createNodeTransport } from "./node-client.js";

export {
  bindNativeAppState,
  defineTool,
  scriptedModel,
  ToolFailure,
  type Agent,
  type AgentOptions,
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
  type Tool,
  type ToolCall,
  type ToolContext,
} from "@larkxai/host";

export { createNodeTransport } from "./node-client.js";

export function sqlite(path: string): SqliteStorage {
  return sqliteFile(path);
}

export async function createRuntime(
  options: Omit<CreateRuntimeOptions, "transport"> & {
    readonly transport?: CreateRuntimeOptions["transport"];
  },
): Promise<Runtime> {
  return openHostRuntime({
    ...options,
    transport: options.transport ?? createNodeTransport(),
  });
}
