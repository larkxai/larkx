import {
  createEngine,
  type AnyWorkflow,
  type ArtifactRecord,
  type Engine,
  type EngineOptions,
} from "@larkx/core";

import { importDurableArtifact } from "./artifacts.js";
import { createExpoSqliteDriver } from "./expo-sqlite-driver.js";
import { createExpoDurableFiles } from "./expo-files.js";
import { randomUUID, sha256 } from "./expo-hash.js";
import { registerLiveOwner } from "./ownership.js";
import { createMobileSqliteStorage } from "./storage.js";

const RUNTIMES = Symbol.for("larkx.mobileRuntimes");

export interface ReactNativeEngineOptions extends Omit<EngineOptions, "storage" | "ownerId"> {
  readonly database: string;
  readonly ownerId?: string;
  readonly workflows: readonly AnyWorkflow[];
}

export interface ReactNativeEngine extends Engine {
  readonly database: string;
  importArtifact(input: {
    sourceUri: string;
    artifactId: string;
    contentType: string;
  }): Promise<ArtifactRecord>;
}

interface RuntimeGlobal {
  [RUNTIMES]?: Map<string, ReactNativeEngine>;
}

function runtimes(): Map<string, ReactNativeEngine> {
  const global = globalThis as RuntimeGlobal;
  const existing = global[RUNTIMES];
  if (existing) {
    return existing;
  }
  const created = new Map<string, ReactNativeEngine>();
  global[RUNTIMES] = created;
  return created;
}

/**
 * Open the engine for this database in the current JavaScript realm.
 * A second call returns the existing engine until `close()`.
 * A destroyed realm (force-quit or full reload) starts a new owner.
 * That owner may take unfinished runs because the previous owner is no longer live.
 */
export function openReactNativeEngine(options: ReactNativeEngineOptions): ReactNativeEngine {
  const existing = runtimes().get(options.database);
  if (existing) {
    return existing;
  }
  const engine = createReactNativeEngine(options);
  runtimes().set(options.database, engine);
  return engine;
}

export function createReactNativeEngine(options: ReactNativeEngineOptions): ReactNativeEngine {
  const { database, ownerId: requestedOwnerId, ...engineOptions } = options;
  const ownerId = requestedOwnerId ?? randomUUID();
  const unregister = registerLiveOwner(ownerId);
  const driver = createExpoSqliteDriver(database);
  const storage = createMobileSqliteStorage(driver);
  const files = createExpoDurableFiles();
  const engine = createEngine({
    ...engineOptions,
    storage,
    ownerId,
    createId: options.createId ?? randomUUID,
  });
  let closed = false;
  const mobile: ReactNativeEngine = {
    ownerId: engine.ownerId,
    database,
    capabilities: engine.capabilities,
    start: (workflow, request) => engine.start(workflow, request),
    resume: (runId) => engine.resume(runId),
    recover: () => engine.recover(),
    getRun: (runId) => engine.getRun(runId),
    listRuns: (query) => engine.listRuns(query),
    cancel: (runId) => engine.cancel(runId),
    subscribe: (runId, listener) => engine.subscribe(runId, listener),
    getHistory: (runId) => engine.getHistory(runId),
    getSteps: (runId) => engine.getSteps(runId),
    reconcileStep: (runId, stepKey, resolution) => engine.reconcileStep(runId, stepKey, resolution),
    register: (workflow) => engine.register(workflow),
    importArtifact: (input) =>
      importDurableArtifact({
        storage,
        files,
        sourceUri: input.sourceUri,
        artifactId: input.artifactId,
        contentType: input.contentType,
        nowMs: Date.now(),
        hash: sha256,
      }),
    async close() {
      if (closed) {
        return;
      }
      closed = true;
      runtimes().delete(database);
      unregister();
      await engine.close();
    },
  };
  return mobile;
}
