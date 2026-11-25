import { NativeModules } from "react-native";
import { Directory, File, Paths } from "expo-file-system";

import {
  createRuntime as openHostRuntime,
  sqlite as sqliteFile,
  type CreateRuntimeOptions,
  type Runtime,
  type SqliteStorage,
} from "./runtime.js";

export {
  bindNativeAppState,
  defineTool,
  scriptedModel,
  ToolFailure,
  type Agent,
  type AgentOptions,
  type AgentResult,
  type AppStateSource,
  type HistoryEvent,
  type HistoryStep,
  type HostTransport,
  type JsonSchema,
  type Model,
  type ModelContext,
  type ModelRequest,
  type ModelResponse,
  type ReconcileInput,
  type RetryPolicy,
  type Run,
  type RunHistory,
  type RunStatus,
  type Runtime,
  type SqliteStorage,
  type RuntimeVersions,
  type ScriptedModel,
  type StartInput,
  type Tool,
  type ToolCall,
  type ToolContext,
} from "./runtime.js";

interface NativeCoreModule {
  invoke(method: string, argsJson: string): Promise<string>;
}

export function applicationDatabase(name = "larkx-native.db"): string {
  const directory = new Directory(Paths.document, "larkx");
  if (!directory.exists) {
    directory.create();
  }
  const file = new File(directory, name);
  const uri = file.uri;
  const path = uri.startsWith("file://") ? uri.slice("file://".length) : uri;
  if (path.trim().length === 0) {
    throw new Error("The application document directory did not yield a SQLite path.");
  }
  return path;
}

/** SQLite file for the native runtime. Omit the path to use the application document directory. */
export function sqlite(path?: string): SqliteStorage {
  return sqliteFile(path ?? applicationDatabase());
}

export async function createRuntime(
  options: Omit<CreateRuntimeOptions, "transport" | "storage"> & {
    readonly storage?: SqliteStorage;
  } = {},
): Promise<Runtime> {
  const native = NativeModules.LarkXNativeCore as NativeCoreModule | undefined;
  if (native === undefined || typeof native.invoke !== "function") {
    throw new Error(
      "LarkXNativeCore is not installed. The native C++ runtime needs a development build. Expo Go does not load this module, and this entry does not fall back to the TypeScript engine.",
    );
  }
  const module = native;
  return openHostRuntime({
    ...options,
    storage: options.storage ?? sqlite(),
    transport: {
      invoke(method, args) {
        return module.invoke(method, JSON.stringify(args));
      },
    },
  });
}
