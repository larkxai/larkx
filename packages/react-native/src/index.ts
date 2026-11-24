import { AppState } from "react-native";
import * as Network from "expo-network";

import { createExpoSqliteDriver } from "./expo-sqlite-driver.js";
import { bindMobileLifecycle, type MobileLifecycle, type Recoverable } from "./lifecycle.js";
import { createMobileSqliteStorage } from "./storage.js";

export { importDurableArtifact } from "./artifacts.js";
export type { DurableFileSystem, ImportArtifactInput } from "./artifacts.js";

export { createExpoSqliteDriver } from "./expo-sqlite-driver.js";
export { createReactNativeEngine, openReactNativeEngine } from "./engine.js";
export type { ReactNativeEngine, ReactNativeEngineOptions } from "./engine.js";

export { useLarkxRun } from "./hooks.js";
export type { WorkflowObservation } from "./hooks.js";

export { bindMobileLifecycle } from "./lifecycle.js";
export type { AppStateSource, MobileLifecycle, NetworkSource } from "./lifecycle.js";

export { isLiveOwner, registerLiveOwner } from "./ownership.js";
export { createMobileSqliteStorage } from "./storage.js";
export type { MobileSqliteStorageOptions } from "./storage.js";

export interface ReactNativeSqliteOptions {
  readonly database: string;
}

/**
 * Storage for `createEngine` from `@larkxai/core`.
 * Register the engine owner with `registerLiveOwner` before starting work,
 * or use `openReactNativeEngine`, which does that itself.
 */
export function reactNativeSqliteStorage(options: ReactNativeSqliteOptions) {
  return createMobileSqliteStorage(createExpoSqliteDriver(options.database));
}

/**
 * Recover on foreground and read connectivity.
 * Leaving the foreground does not release ownership and does not mean the runtime is dead.
 * This does not schedule native background execution.
 */
export function bindReactNativeLifecycle(
  engine: Recoverable,
  onConnectivity?: (online: boolean | null) => void,
): MobileLifecycle {
  return bindMobileLifecycle(engine, {
    appState: AppState,
    network: {
      async getNetworkState() {
        const state = await Network.getNetworkStateAsync();
        return { isConnected: state.isConnected ?? null };
      },
    },
    ...(onConnectivity ? { onConnectivity } : {}),
  });
}
