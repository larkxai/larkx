# @larkxai/telemetry

```bash
npm install @larkxai/telemetry
```

Optional exporter that copies committed LarkX journal metadata to LarkX Cloud.

The workflow engine does not import this package. A run finishes, fails, or blocks whether or not a batch is acknowledged. Cloud does not retry steps, reconcile unknown outcomes, or cancel runs.

## API

```typescript
import { createNodeEngine, createNodeSqliteDriver } from "@larkxai/node";
import {
  createCloudTelemetry,
  createSqliteTelemetryStore,
  journalFromEngine,
  nodeInstallationMetadata,
} from "@larkxai/telemetry";
import { platform, release } from "node:os";

const engine = createNodeEngine({ database: "/tmp/larkx.db", workflows: [] });
const driver = createNodeSqliteDriver("/tmp/larkx.telemetry");
const telemetry = createCloudTelemetry({
  endpoint: "https://cloud.example",
  apiKey: process.env.LARKX_INGESTION_KEY ?? "",
  journal: journalFromEngine(engine),
  state: createSqliteTelemetryStore(driver),
  appId: "my-app",
  runtime: "node",
  metadata: nodeInstallationMetadata({
    appName: "Notes",
    appVersion: "1.4.0",
    sdkVersion: "0.1.0",
    osName: platform(),
    osVersion: release(),
  }),
});

telemetry.start();
await telemetry.flush();
await telemetry.stop();
driver.close();
```

`endpoint` is the origin. The client posts to `{endpoint}/v1/telemetry/batches`.

`apiKey` is a project ingestion key, `lkx_ing_...`. It is not a workflow owner id. Do not commit it.

`journalFromEngine` reads `listRuns` and `readJournal`. `readJournal` is the metadata projection: statuses, names, versions, step keys, effect classes, operation ids, attempt numbers, error codes, sequences, and timestamps. It does not include workflow input, step input, step output, error text, or the owner id.

`start()` arms a foreground timer. `setActive(false)` clears that timer. Call it when a React Native app leaves the foreground. The timer is not a background scheduler. `flush()` sends immediately and is the manual sync action. `stop()` clears the timer and aborts the current request. Unacknowledged batches stay in the state store.

`flush({ manual: false })` is what the timer uses. After a `401`, a conflict, or another held batch error, that path does not call the network again. A manual `flush()` tries once more.

`current()` reports `idle` (connected, nothing pending), `pending`, `offline`, or `unauthorized`. An app that never constructs an exporter is disabled.

## Installation metadata

`metadata` is optional. Pass an object, or a function that returns one, with only values the platform reported:

- `appName`
- `appVersion`
- `platform` (`ios`, `android`, or `node`)
- `osName`
- `osVersion`
- `deviceModel` (a marketing name such as `iPhone 16`)
- `sdkVersion`

Omitted fields are left out of the batch. Cloud shows those as unavailable. The exporter fills `sdkVersion` with this package's version when the caller does not pass one. It does not invent a platform, OS, or device model from the runtime name. Do not send a serial number, advertising identifier, IDFA, IDFV, or Android id. The installation id stays the id in the telemetry store. Metadata does not replace it and does not identify a physical device.

`nodeInstallationMetadata` sets `platform` to `node`. Pass `os.platform()` and `os.release()` from `node:os` as `osName` and `osVersion`. It does not set a device model, and it does not read a hostname. On React Native, read `Platform.OS` and `Platform.Version` and pass them through `reactNativeInstallationMetadata`. `modelName` from a device-info library is the marketing name. Do not pass a hardware identifier. An `os` other than `ios` or `android` is omitted.

A metadata function that throws is ignored. The journal is still exported.

## What is sent

Telemetry version 1, `mode: "metadata-only"`. The body matches `docs/cloud-observability-spec.md` and the Cloud service in `larkxai/cloud`.

- `Authorization: Bearer lkx_ing_...`
- `Idempotency-Key` equal to `batchId`
- One run per batch, events in sequence order
- The current step and attempt snapshot, without inputs or outputs
- Event payloads reduced to an allowlist of keys the engine already writes

These payload keys are never copied, even if a journal row contained them: `input`, `output`, `messages`, `prompt`, `toolResult`, `content`. Unknown payload keys are dropped rather than redacted in place. Provider ids and model ids are not read out of model step outputs. Tool names are not promoted into the batch. Doing that needs a new non-sensitive protocol field and a new telemetry version, agreed with the Cloud repository first. This package does not add that field.

Agent runs are workflow runs. The workflow name and version are the agent name and version. Step keys such as `model-0` and `tool-0-0` are ordinary step keys.

## Sync state

Exporter state is not a workflow table. `createSqliteTelemetryStore` keeps one JSON document in `larkx_telemetry_state` on a driver you open. `createMemoryTelemetryStore` dies with the process.

The document holds one installation id for that store. The id is a UUID created on first use, or the `installationId` option when the store is empty. A later option does not replace a stored id. It is not a user id and it is not derived from the device hardware.

Cursors and unacknowledged batches are stored per destination. The destination is a hash of the endpoint and the ingestion key. Changing the key or the endpoint starts a new cursor and sends the journal again under the same installation id. The previous destination's cursor stays in the file and is not reused.

A batch is written to the store before it is sent. The same `batchId` and the same body are retried until Cloud returns a success body for that id. The cursor moves only after that acknowledgement. A `200` that is missing `acceptedThroughSequence` does not move the cursor. A `sequence_gap` whose stored prefix is behind the cursor rewinds the cursor and sends the missing prefix. A `401` stops the timer. Network failures use exponential backoff, capped at 60 seconds by default.

The exporter does not delete journal events. This runtime does not prune `workflow_events` either. The backlog is every event with `sequence` greater than the stored cursor. If you delete the workflow database and keep the exporter file, the next run can reuse a run id and conflict with Cloud. Delete the telemetry store in the same reset. If the telemetry file is deleted and the journal remains, the next flush sends the journal from sequence 1. Cloud treats matching events as duplicates.

A corrupt telemetry document is treated as an empty store: a new installation id and a full resync. That shows up as a second device in Cloud.

## React Native

Use the same functions with `createExpoSqliteDriver` from `@larkxai/react-native` and `runtime: "react-native"`. Hermes does not provide `crypto.subtle` or `crypto.randomUUID`. Pass `createId` and `sha256` from `expo-crypto`. Without `sha256`, the exporter uses its own SHA-256. Without `createId`, it uses `crypto.getRandomValues` when that exists. Flush after startup, after `recover()`, when connectivity returns, and from a Sync control. Call `setActive(false)` when `AppState` is not `active`. Do not assume the timer runs while the operating system has suspended the app.

Local inference does not read the ingestion key.

## Limits

Sequential batches, at most 500 events and 256 KiB, which are the Cloud limits. The default chunk is 100 events. No prompt or tool-output upload. No background execution. No provider or model identifier until the protocol changes.
