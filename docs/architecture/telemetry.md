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

The cursor is not inside `workflow_events`. Node stores it in `${database}.telemetry` with the existing `larkx_telemetry_state` table. React Native stores the same JSON document in `${database}.telemetry.json` through `expo-file-system`. One pending batch is kept. A batch is at most 500 events and 256 KiB. The default flush interval is 15 seconds. `flushIntervalMs: 0` disables the timer. `flushTelemetry()` sends immediately. `close()` does not start a network flush. It aborts an in-flight request, clears the timer, and leaves the pending batch in the cursor. Delivery continues the next time the runtime is open.

A flush does not load every historical event. The native calls are `journalHeads` (run id, updated time, maximum sequence) and `eventPage` (run id, sequence greater than the cursor, at most 500 events, plus run and step metadata). Step inputs and outputs are not read. Caught-up runs whose snapshot has not changed are not read again.

Enabling telemetry does not backfill runs that already have events. The first time a destination is authorized, those runs are sealed. A later sequence would be a gap, and the version 1 contract treats a gap as a conflict. Runs created after that authorization export from sequence 1, including events committed while the device was offline. Changing the endpoint, the project id, or the ingestion key is a new destination and seals the runs that exist at that moment. The same destination keeps its cursor across restart. Two exporters share that cursor through a revision check: a writer never replaces a stored cursor with a lower one. The stored document contains the installation id, cursors, and a hash of the destination. It does not contain the ingestion key or the endpoint.

The execution journal is not deleted to make room for telemetry, and it is not bounded by the exporter. It grows with agent execution because recovery still needs those rows. The pending batch is bounded. The cursor document grows with the number of runs and authorized destinations, not with the number of events. If Cloud is unreachable for a long time, the journal keeps every execution event, the exporter keeps one unacknowledged batch, and retries back off. Nothing in that suffix is dropped. `telemetryStatus().exportBehind` is true when more than 2000 eligible events are still unsent. That is a lag signal, not a count of discarded events. Sealed historical runs are not part of the count. Execution continues, and the unsent suffix remains available for a later flush.

The batch URL is `{endpoint}/v1/telemetry/batches`. The default endpoint is `https://cloud.larkx.ai`. An `http` URL is accepted only when the caller sets it, for a development collector or a LAN demo. The endpoint cannot contain userinfo, a query, a fragment, or ASCII whitespace. The SDK does not rewrite HTTPS to HTTP and does not change the application's ATS or network-security configuration.

SDK-managed requests do not follow redirects. Node uses `node:http` and `node:https` and stops on every 3xx, including a same-origin `Location`. React Native does not use `fetch` for these calls. `LarkXHttp` rejects the redirect in the `URLSession` redirect delegate before the next request is created, and the Android module sets `HttpURLConnection.setInstanceFollowRedirects(false)` without changing the process-wide follow-redirects flag. A redirect is not an acknowledgement. The ingestion key and the batch body are not sent to the next URL. Rejecting the redirect does not prove the original request had no effect. Closing the runtime, stopping the exporter, or aborting the request cancels the native socket. A late callback cannot advance the cursor. Response bodies are capped at 64 KiB. The Node behavior is covered by socket tests. The iOS and Android modules have not been executed on a simulator or a device in this repository's CI.

Network loss, HTTP 408, and HTTP 500, 502, 503, and 504 leave the pending batch in place. Backoff starts at one second and is capped at 60 seconds. HTTP 429 is a temporary rate limit. A numeric or HTTP-date `Retry-After` is honored up to five minutes and is never shorter than the backoff. `401` and a key that does not start with `lkx_ing_` stop the destination until a manual flush. A redirect or an unknown HTTP 400 holds the destination the same way, because the body did not name one run. The batch stays pending and is not marked delivered.

A known permanent run rejection does not hold the rest of the destination. The exporter records the run id and a short reason, leaves the delivery cursor where it is, and exports other runs. The reasons are `quota_exceeded`, `history_conflict`, a non-rewindable `sequence_gap`, `batch_too_large`, `sensitive_payload`, and `run_rejected`. The record is capped at 64 runs. The timer does not rediscover those runs. `flushTelemetry()` clears the record and tries them once, which is how a run can export after an operator raises a quota. `telemetryStatus().rejectedRuns` and `lastError: "rejected"` mean synchronization is partial. A rejected run is not reported as delivered. None of these outcomes change the local journal.

Cloud currently returns HTTP 429 `{ "error": "rate_limited" }` both for the per-organization minute limit and for the permanent 20,000 stored-events-per-run cap. The SDK cannot tell those apart, so both stay on the temporary backoff path and the pending batch remains that one run until the response changes. The follow-up Cloud contract is HTTP 409 `{ "error": "run_rejected", "runId": "<id>", "reason": "event_limit" }`. The SDK already isolates `run_rejected` and will not advance the cursor for it. Do not treat today's 429 as that signal.

Identifiers use `crypto.randomUUID` or `crypto.getRandomValues` when the runtime provides them. React Native 0.88's JavaScript runtime does not install either, and it does not install `TextEncoder` or `crypto.subtle`. The exporter still builds a UUID-shaped id and a SHA-256 destination hash without those APIs. `AbortController` is provided by React Native. The cursor file uses `expo-file-system`. This has not been executed on a phone.

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

The Cloud repository accepts telemetry version 1 with storage schema 3. This runtime reports schema 3. Production `https://cloud.larkx.ai` was last deployed on 20 November 2026, before that Cloud change, and still accepts schema 1 only. Do not describe production ingestion as verified. The test collector in `tests/host/telemetry-export.test.ts` accepts schema 3 and the existing acknowledgement shape. It is not a second backend.

The contract is [the native telemetry contract](../cloud-native-telemetry.md). React Native passes `createId` from `expo-crypto` `randomUUID` when Cloud telemetry is enabled. The exporter no longer builds ids from the clock and `Math.random`. Node uses Web Crypto. A missing cryptographic source throws.
