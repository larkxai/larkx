# @larkxai/telemetry

Optional client that posts metadata batches to LarkX Cloud. This package is private and is not a public install target. The C++ runtime does not import this package and does not build a journal for it. Native telemetry export is a later milestone. A run completes whether or not a batch is acknowledged. Cloud does not retry steps, reconcile unknown outcomes, or cancel runs.

```typescript
import {
  createCloudTelemetry,
  createMemoryTelemetryStore,
  nodeInstallationMetadata,
} from "@larkxai/telemetry";

const telemetry = createCloudTelemetry({
  endpoint: "https://cloud.example",
  apiKey: process.env.LARKX_INGESTION_KEY ?? "",
  journal: {
    async listRuns() {
      return [];
    },
    async readJournal() {
      return null;
    },
  },
  state: createMemoryTelemetryStore(),
  appId: "my-app",
  runtime: "node",
  metadata: nodeInstallationMetadata({
    appName: "Notes",
    appVersion: "1.4.0",
    sdkVersion: "0.1.2",
    osName: "linux",
    osVersion: "6.12",
  }),
});
```

Replace `journal` with a source that reads a `JournalDocument`. That document is a metadata projection. Do not put prompts, tool results, or the owner id in it.

`endpoint` is the origin. The client posts to `{endpoint}/v1/telemetry/batches`.

`apiKey` is a project ingestion key, `lkx_ing_...`. Do not commit it.

`start()` arms a foreground timer. `setActive(false)` clears that timer. `flush()` sends immediately. `stop()` clears the timer and aborts the current request. Unacknowledged batches stay in the state store.

`flush({ manual: false })` is what the timer uses. After a `401`, a conflict, or another held batch error, that path does not call the network again. A manual `flush()` tries once more.

`current()` reports `idle`, `pending`, `offline`, or `unauthorized`.

## Installation metadata

Pass only values the platform reported: `appName`, `appVersion`, `platform` (`ios`, `android`, or `node`), `osName`, `osVersion`, `deviceModel`, and `sdkVersion`. The exporter fills `sdkVersion` with this package's version when the caller does not pass one. It does not invent a device model. Do not send a serial number, advertising identifier, IDFA, IDFV, or Android id.

`nodeInstallationMetadata` sets `platform` to `node`. It does not set a device model. `reactNativeInstallationMetadata` accepts `ios` or `android`.

## What is sent

Telemetry version 1, `mode: "metadata-only"`. The body matches `docs/cloud-observability-spec.md`.

- `Authorization: Bearer lkx_ing_...`
- `Idempotency-Key` equal to `batchId`
- One run per batch, events in sequence order

These payload keys are never copied: `input`, `output`, `messages`, `prompt`, `toolResult`, `content`.

## Sync state

`createSqliteTelemetryStore` keeps one JSON document in `larkx_telemetry_state` on a driver you open. The driver is any object with `exec`, `get`, `run`, and `transaction`. `createMemoryTelemetryStore` dies with the process.

The store holds one installation id. Cursors are per destination, hashed from the endpoint and the ingestion key. A batch is written before it is sent. The same body is retried until the acknowledgement names that batch. A `401` stops the timer.

The exporter does not delete agent data. If you delete the agent database and keep the telemetry file, a reused run id can conflict in Cloud. Delete both on reset.
