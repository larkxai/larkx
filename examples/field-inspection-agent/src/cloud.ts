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

export const TELEMETRY_DATABASE = "larkx-inspection-telemetry.db";

export interface CloudConnection {
  readonly telemetry: CloudTelemetry | null;
  readonly driver: SqliteDriver | null;
}

export function readCloudConfig(): {
  endpoint: string;
  apiKey: string;
  dashboard: string | null;
} | null {
  const endpoint = process.env.EXPO_PUBLIC_LARKX_CLOUD_ENDPOINT?.trim() ?? "";
  const apiKey = process.env.EXPO_PUBLIC_LARKX_INGESTION_KEY?.trim() ?? "";
  if (endpoint.length === 0 || apiKey.length === 0) {
    return null;
  }
  const dashboard = process.env.EXPO_PUBLIC_LARKX_CLOUD_DASHBOARD?.trim() ?? "";
  return { endpoint, apiKey, dashboard: dashboard.length > 0 ? dashboard : null };
}

export function dashboardUrl(template: string | null, runId: string): string | null {
  if (template === null || !template.includes("{runId}")) {
    return null;
  }
  return template.replaceAll("{runId}", encodeURIComponent(runId));
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
    appId: "field-inspection-agent",
    runtime: "react-native",
    metadata: () =>
      reactNativeInstallationMetadata({
        os: Platform.OS,
        version: Platform.Version,
        appName: "Field inspection",
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

export function cloudLabel(
  phase: TelemetryPhase | "disabled",
  online: boolean | null,
  pending: number,
  syncedAt: number | null,
): string {
  if (phase === "disabled") {
    return "Disabled";
  }
  if (phase === "unauthorized") {
    return "Authentication error";
  }
  if (online === false || phase === "offline") {
    return "Offline";
  }
  if (phase === "pending" || pending > 0) {
    return "Sync pending";
  }
  if (syncedAt !== null) {
    return "Synced";
  }
  return "Connected";
}
