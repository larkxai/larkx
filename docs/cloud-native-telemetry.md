# Native telemetry contract for LarkX Cloud

This is the proposal for the next change in `larkxai/cloud`. This repository does not change that service. The React Native exporter already posts the version 1 batch below. Current Cloud rejects it.

## What Cloud accepts today

`POST /v1/telemetry/batches` with `Authorization: Bearer lkx_ing_…`.

The body is telemetry version 1, protocol version 1, `mode: "metadata-only"`. Cloud requires `storageSchemaVersion` to be 1 (`src/lib/telemetry/validate.ts`). The native runtime's schema is 3, so Cloud returns 400 `invalid_batch` before it stores an event. Unknown batch fields are also rejected. Unknown event payload keys are ignored. Deduping is by `batchId` (same body returns the original success, a different body is `invalid_batch`) and by `(installationId, runId, sequence)` when the event id and payload match. A sequence gap is 409 `sequence_gap`. Sensitive payload keys are 422. `401` is unauthorized. `413` is too large. `429` and `5xx` are retryable. The response does not contain commands.

The project is the project bound to the ingestion key. The mobile client sends `source.appId` and does not add a `projectId` field.

## What the device sends

`storageSchemaVersion: 3`. Protocol version stays 1. Telemetry version stays 1. Event names stay the existing 17 native types. New information is inside the allowlisted payload:

- `kind`: `model`, `tool`, or `remote`
- `attempt`
- `durationMs`
- `modelProvider`, `modelId`
- `inputTokens`, `outputTokens`, `timeToFirstTokenMs`
- `toolName`
- `transport`: `http` or `a2a`
- `operationId`, `remoteAgent`, `taskId`, `stepKey` on remote events
- `WORKFLOW_RECOVERED`: `from` (`interrupted` or `paused`) and `stepKey`

Host lifecycle observations are not in the batch. A later contract can add them as a separate array. Do not accept them by ignoring unknown batch fields.

The acknowledgement the device already understands is unchanged:

```json
{
  "telemetryVersion": 1,
  "batchId": "…",
  "results": [{ "runId": "…", "status": "accepted", "acceptedThroughSequence": 12 }]
}
```

`acceptedThroughSequence` may be less than `throughSequence`. The device then sends the remainder. The same `batchId` may be posted again if the device dies before it stores the cursor.

## Required Cloud changes

1. Accept `storageSchemaVersion` 3 for telemetry version 1, and keep rejecting a schema the server does not know.
2. Persist the payload keys listed above. Continue ignoring keys that are not on that list.
3. Keep batch-level and `(installationId, runId, sequence)` dedupe.
4. Treat `WORKFLOW_RECOVERED` as an observation that a new process found a non-terminal run. It is not proof of the current process state.
5. Do not return execution commands.

No other batch field is required. Adding one would make current clients and the current server disagree.

## Dashboard data for the following milestone

Cloud should show the last observation, not a live process state. Missing telemetry does not mean the application exited. A device that is offline has no new events to display.

Overview: observed runs, runs whose last event is non-terminal, completed runs, failed runs, runs with `WORKFLOW_RECOVERED`, completion among runs that have a terminal event, and duration from the first event to the terminal event when both exist.

Run detail: run id, agent name and version, installation id, last observed status, model and tool operations, local versus remote (`kind` and `transport`), delegation history (`operationId`, `remoteAgent`, `taskId`), recovery events, attempt numbers, and `durationMs` when present.

Recovery: `WORKFLOW_RECOVERED`, a later `STEP_COMPLETED` for a step that already completed before that event (the committed result was reused), `STEP_RETRY_SCHEDULED`, `STEP_OUTCOME_UNKNOWN`, `STEP_RECONCILED`, and a remote task id that appears again after recovery.

Freshness: timestamp of the last stored event, last successful batch time, events whose `createdAt` is much earlier than the time they were ingested, and a runtime with no recent batch. Label that state stale. Do not label it terminated.
