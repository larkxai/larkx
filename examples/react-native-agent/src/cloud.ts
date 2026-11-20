import type { ReactNativeEngine } from "@larkx/react-native";
import { createExpoSqliteDriver } from "@larkx/react-native";
import * as Crypto from "expo-crypto";
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

export const TELEMETRY_DATABASE = "larkx-agent-telemetry.db";

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
    appId: "react-native-agent",
    runtime: "react-native",
    metadata: () =>
      reactNativeInstallationMetadata({
        os: Platform.OS,
        version: Platform.Version,
        appName: "React Native agent",
        appVersion: "0.1.0",
      }),
    intervalMs: 15_000,
    createId: () => Crypto.randomUUID(),
    sha256: sha256Hex,
  });
  telemetry.start();
  return { telemetry, driver };
}

async function sha256Hex(data: Uint8Array): Promise<string> {
  const copy = new Uint8Array(data.byteLength);
  copy.set(data);
  const digest = await Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256, copy);
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, "0")).join("");
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
