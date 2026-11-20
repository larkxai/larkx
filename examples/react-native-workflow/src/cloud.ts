import type { ReactNativeEngine } from "@larkx/react-native";
import { createExpoSqliteDriver } from "@larkx/react-native";
import {
  createCloudTelemetry,
  createSqliteTelemetryStore,
  journalFromEngine,
  reactNativeInstallationMetadata,
  type CloudTelemetry,
  type TelemetryPhase,
} from "@larkx/telemetry";
import { Platform } from "react-native";
import type { SqliteDriver } from "@larkx/storage-sqlite";

export const TELEMETRY_DATABASE = "larkx-workflow-telemetry.db";

export interface CloudConnection {
  readonly telemetry: CloudTelemetry | null;
  readonly driver: SqliteDriver | null;
}

export function readCloudConfig(): { endpoint: string; apiKey: string } | null {
  const endpoint = process.env.EXPO_PUBLIC_LARKX_CLOUD_ENDPOINT?.trim() ?? "";
  const apiKey = process.env.EXPO_PUBLIC_LARKX_INGESTION_KEY?.trim() ?? "";
  if (endpoint.length === 0 || apiKey.length === 0) {
    return null;
  }
  return { endpoint, apiKey };
}

export function openCloud(engine: ReactNativeEngine): CloudConnection {
  const config = readCloudConfig();
  if (!config) {
    return { telemetry: null, driver: null };
  }
  const driver = createExpoSqliteDriver(TELEMETRY_DATABASE);
  const telemetry = createCloudTelemetry({
    endpoint: config.endpoint,
    apiKey: config.apiKey,
    journal: journalFromEngine(engine),
    state: createSqliteTelemetryStore(driver),
    appId: "react-native-workflow",
    runtime: "react-native",
    metadata: () =>
      reactNativeInstallationMetadata({
        os: Platform.OS,
        version: Platform.Version,
        appName: "React Native workflow",
        appVersion: "0.1.0",
      }),
    intervalMs: 15_000,
  });
  telemetry.start();
  return { telemetry, driver };
}

export function cloudLabel(phase: TelemetryPhase | "disabled"): string {
  if (phase === "disabled") {
    return "Disabled";
  }
  if (phase === "idle") {
    return "Connected";
  }
  if (phase === "offline") {
    return "Offline";
  }
  if (phase === "unauthorized") {
    return "Authentication error";
  }
  return "Pending synchronization";
}
