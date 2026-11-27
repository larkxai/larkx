import type { TelemetryDeliveryStatus } from "@larkxai/react-native";

export type TelemetryPresentation =
  | "Disabled"
  | "Pending"
  | "Offline"
  | "Synchronized"
  | "Unauthorized"
  | "Configuration error"
  | "Rate limited"
  | "Partial synchronization";

const CONFIGURATION_ERRORS = new Set([
  "invalid_batch",
  "sensitive_payload",
  "malformed_ack",
  "unsupported",
  "history_conflict",
  "sequence_gap",
  "batch_too_large",
]);

/** Names the exporter phase. This is not a live connection to the device. */
export function telemetryPresentation(status: TelemetryDeliveryStatus): TelemetryPresentation {
  if (!status.enabled) {
    return "Disabled";
  }
  if (status.phase === "unauthorized" || status.lastError === "unauthorized") {
    return "Unauthorized";
  }
  if (status.lastError === "rate_limited") {
    return "Rate limited";
  }
  if (status.lastError === "rejected" || status.rejectedRuns > 0) {
    return "Partial synchronization";
  }
  if (
    status.lastError === "redirected" ||
    (status.lastError !== null && CONFIGURATION_ERRORS.has(status.lastError))
  ) {
    return "Configuration error";
  }
  if (status.phase === "offline" || status.lastError === "offline") {
    return "Offline";
  }
  if (status.phase === "pending" || status.pendingEvents > 0) {
    return "Pending";
  }
  if (status.lastSyncedAt !== null) {
    return "Synchronized";
  }
  return "Pending";
}
