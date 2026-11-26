# Telemetry

Telemetry is optional. A runtime with no `telemetry` option does not open a socket and does not create an export cursor. Agent execution does not wait for a collector. A failed export does not fail a run.

The C++ runtime owns execution state and the append-only `workflow_events` journal. It does not import the telemetry client and it does not open a network connection. The host driver reads that journal, keeps an export cursor outside the execution schema, and posts metadata when the application configured a destination.

```text
React Native application
        |
   LarkX runtime
        |
  Native C++ core
        |
      SQLite
     /      \
Execution     Event journal
state              |
                   v
          Host telemetry exporter
                   |
          Offline-safe delivery
                   |
                   v
             LarkX Cloud
```

Cloud observes. It does not start, retry, reconcile, or cancel a run. The local database remains the execution record.

## Event contract

Batches keep telemetry version 1 from [the cloud observability spec](../cloud-observability-spec.md). Each event keeps the native `eventId`, per-run `sequence`, and event type. Ordering is per run. There is no global order across devices. Delivery is at-least-once for events that are still behind the cursor. The same `eventId` may arrive again after a crash. Collectors dedupe on `batchId` and on `(installationId, runId, sequence)`.

`eventPayload` returns an envelope `{ eventId, sequence, type, createdAt, payload }`. `getHistory` still exposes the inner payload. The ABI function signature is unchanged.

Native types already cover the execution categories:

| Category                                                             | Native event                                                                   | Useful payload                                                                                                                                                                                |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Run created, started, waiting, blocked, completed, failed, cancelled | `WORKFLOW_*`                                                                   | Status fields and a safe `code` when the run is blocked or failed                                                                                                                             |
| Run resumed in a new process                                         | `WORKFLOW_RECOVERED`                                                           | `from` is `interrupted` or `paused`, plus `stepKey`                                                                                                                                           |
| Model or tool started                                                | `STEP_STARTED`                                                                 | `kind` is `model`, `tool`, or `remote`, plus `attempt`                                                                                                                                        |
| Model or tool committed                                              | `STEP_COMPLETED`                                                               | `durationMs` when the attempt has a start time. Model id, provider, token counts, and time to first token only when the host submitted those integers. Tool name when it is a safe identifier |
| Model or tool failed or retried                                      | `STEP_FAILED`, `STEP_RETRY_SCHEDULED`                                          | `kind`, `attempt`, `attemptStatus`                                                                                                                                                            |
| Unknown outcome and reconciliation                                   | `STEP_OUTCOME_UNKNOWN`, `STEP_RECONCILED`                                      | `reason` is a runtime code, not the exception text                                                                                                                                            |
| Remote delegation                                                    | `REMOTE_DISPATCH_QUEUED`, `REMOTE_DISPATCH_ACCEPTED`, `REMOTE_RESULT_RECEIVED` | `operationId`, `remoteAgent`, `taskId`, `transport` (`http` or `a2a`)                                                                                                                         |

`WORKFLOW_BLOCKED` `code` is `remote_auth_required` or `remote_input_required` when a remote task needs a person. The runtime does not emit an event at the moment the operating system kills the process. `WORKFLOW_RECOVERED` is written later, when a process drives a non-terminal run that this process did not start. A pause and resume in the same process does not write it.

Host observations (`runtime-initialized`, `runtime-closed`, foreground, background, connectivity lost, connectivity restored) stay on the device. They are not rows in `workflow_events` and they are not fields of a version 1 batch. The current Cloud contract rejects unknown batch fields. `telemetryStatus().observations` is the local ring, capped at 32.

Measurements that the model response does not include are omitted. The exporter does not invent token counts or time to first token.

## Privacy

Export uses an allowlist in `@larkxai/telemetry`. Unknown event fields are dropped. The exporter does not upload the native payload as a blob.

Never exported, even if they are stored for execution: prompts, system instructions, model text, tool arguments, tool results, remote messages, continuation text, authentication headers, endpoint URLs, context ids, owner ids, and raw exception text. Agent names, tool names, step keys, operation ids, and remote agent names are developer-chosen identifiers and are exported when they match the allowlist. Do not put a secret in those names.

There is no option to upload execution contents.

The installation id is a generated UUID stored in the export cursor. It is not a hardware identifier. Installation metadata accepts only `appName`, `appVersion`, `platform`, `osName`, `osVersion`, `deviceModel`, and `sdkVersion`.

## Offline export

1. The runtime commits the execution event in SQLite.
2. A later flush reads events after the cursor.
3. The allowlist builds one batch.
4. The batch is stored in the export cursor before the request is sent.
5. The collector acknowledges `acceptedThroughSequence`.
6. The cursor advances.
7. Anything still behind the cursor is sent again.

If the process dies after the collector stores the batch and before the cursor advances, the next flush sends the same `batchId` and the same event ids.

The cursor is not inside `workflow_events`. Node stores it in `${database}.telemetry` with the existing `larkx_telemetry_state` table. React Native stores the same JSON document in `${database}.telemetry.json` through `expo-file-system`. One pending batch is kept. A batch is at most 500 events and 256 KiB. The default flush interval is 15 seconds. `flushIntervalMs: 0` disables the timer. `flushTelemetry()` sends immediately. `close()` flushes once, aborts the current request, and clears the timer.

The journal is not deleted to make room for telemetry. Sequences are not skipped: the version 1 contract treats a gap as a conflict and would stall the cursor. `telemetryStatus().exportBehind` is true when more than 2000 events are still unsent. That is a lag signal. Execution continues, and the unsent suffix remains available for a later flush.

Network loss returns status 0 and leaves the pending batch in place. Backoff starts at one second and is capped at 60 seconds. `401` and a key that does not start with `lkx_ing_` stop the destination until a manual flush. `429`, `5xx`, a timeout, and a malformed acknowledgement are retried. `400`, `413`, and `422` hold the destination so a bad batch is not retried in a loop. None of these outcomes change the run.

The exporter does not promise delivery while iOS or Android has suspended the process. Delivery continues when the runtime is open again.

## SDK

```typescript
import { createRuntime, larkxCloud, sqlite } from "@larkxai/react-native";

const runtime = await createRuntime({
  storage: sqlite(),
  telemetry: larkxCloud({
    projectId: "my-project",
    apiKey: "lkx_ing_…",
  }),
});

await runtime.flushTelemetry();
runtime.telemetryStatus();
```

`projectId` is sent as `source.appId`. Cloud authorizes the ingestion key. Do not embed an administrative credential. `endpoint` defaults to `https://cloud.larkx.ai` and the client posts `/v1/telemetry/batches`.

A custom sink uses `{ exporter }`. The default runtime passes neither.

`@larkxai/telemetry` is private. React Native is the public SDK. Node is the test host and opens the cursor database for tests.

## Cloud

Current LarkX Cloud accepts telemetry version 1 only when `storageSchemaVersion` is 1. This runtime reports schema 3, so production Cloud rejects the batch. Do not describe Cloud ingestion as complete. The test collector in `tests/host/telemetry-export.test.ts` accepts schema 3 and the existing acknowledgement shape. It is not a second backend.

The proposed Cloud change is [the native telemetry contract](../cloud-native-telemetry.md).
