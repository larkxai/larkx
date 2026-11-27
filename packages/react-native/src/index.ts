import { Directory, File, Paths } from "expo-file-system";
import { NativeModules } from "react-native";

import { requireNativeUuid } from "./native-id.js";
import { createNativeSecureHttp } from "./secure-http.js";

import {
  createRuntime as openHostRuntime,
  sqlite as sqliteFile,
  type CreateRuntimeOptions,
  type Runtime,
  type SqliteStorage,
  type TelemetryCursorStore,
} from "@larkxai/host";
import { parseDocument } from "@larkxai/telemetry";

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
  type AppStateSource,
  type HistoryEvent,
  type HistoryStep,
  type HostEvent,
  type HostTransport,
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

interface NativeCoreModule {
  invoke(method: string, argsJson: string): Promise<string>;
}

export function applicationDatabase(name = "larkx.db"): string {
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
      "LarkXNativeCore is not installed. The C++ runtime needs a development build. Expo Go does not load this module.",
    );
  }
  const module = native;
  const storage = options.storage ?? sqlite();
  const telemetryState =
    options.telemetry !== undefined && options.telemetryState === undefined
      ? fileTelemetryStore(storage.path)
      : options.telemetryState;
  return openHostRuntime({
    ...withNativeTelemetryIdentity(options),
    storage,
    runtimeName: "react-native",
    ...(telemetryState !== undefined ? { telemetryState } : {}),
    transport: {
      invoke(method, args) {
        return module.invoke(method, JSON.stringify(args));
      },
    },
    http: options.http ?? createNativeSecureHttp(),
  });
}

function withNativeTelemetryIdentity<
  T extends { readonly telemetry?: CreateRuntimeOptions["telemetry"] },
>(options: T): T {
  const telemetry = options.telemetry;
  if (
    telemetry === undefined ||
    !("kind" in telemetry) ||
    telemetry.kind !== "larkx-cloud" ||
    telemetry.createId !== undefined
  ) {
    return options;
  }
  return {
    ...options,
    telemetry: {
      ...telemetry,
      createId: requireNativeUuid(),
    },
  };
}

const fileQueues = new Map<string, Promise<void>>();

function fileTelemetryStore(databasePath: string): TelemetryCursorStore {
  const slash = databasePath.lastIndexOf("/");
  const directory = new Directory(slash >= 0 ? databasePath.slice(0, slash) : ".");
  const name = `${slash >= 0 ? databasePath.slice(slash + 1) : databasePath}.telemetry.json`;
  const file = new File(directory, name);
  const key = file.uri;
  const exclusive = async <T>(work: () => Promise<T>): Promise<T> => {
    const previous = fileQueues.get(key) ?? Promise.resolve();
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const tail = previous.then(() => gate);
    fileQueues.set(key, tail);
    await previous;
    try {
      return await work();
    } finally {
      release();
    }
  };
  return {
    async load() {
      return exclusive(async () => {
        if (!file.exists) {
          return null;
        }
        return parseDocument(await file.text());
      });
    },
    async save(document, expectedRevision) {
      return exclusive(async () => {
        const current = file.exists ? parseDocument(await file.text()) : null;
        const currentRevision =
          current !== null && typeof current.revision === "number" ? current.revision : 0;
        if (currentRevision !== expectedRevision) {
          return false;
        }
        if (!directory.exists) {
          directory.create();
        }
        file.write(JSON.stringify(document));
        return true;
      });
    },
  };
}
