# Telemetry export

`@larkxai/telemetry` is an optional client for the batch contract in [the cloud observability spec](../cloud-observability-spec.md). Ingestion, accounts, and the dashboard live in `larkxai/cloud`. This repository does not implement them.

## Attachment

The engine has no telemetry option. Execution never waits on a response, and a failed export cannot fail a step.

The host passes `journalFromEngine(engine)` into `createCloudTelemetry`. The journal port is `listRuns` plus `readJournal`. `readJournal` projects the committed run, steps, attempts, and events. It is the public read used by the exporter. The exporter does not import the SQLite driver that stores workflows, and it does not read `input_json` or `output_json`.

Agents need no extra instrumentation. An agent run is a workflow run. Model and tool steps are already `model-<iteration>` and `tool-<iteration>-<index>`.

## Privacy

Export mode is `metadata-only`. Payloads are copied through an allowlist of keys the runtime already stores in `workflow_events`. Sensitive keys are not stripped from a free-form object and then uploaded. They are never selected.

Model provider, model id, assistant text, and tool arguments share the model step output. That output stays on the device. A future metadata field for the provider and model id would be a protocol change and a telemetry version change. It is not part of version 1. Coordinate it with `larkxai/cloud` before adding it.

## Delivery

The device pushes. Cloud does not call back with a command. The exporter stores the batch before the POST and retries that same body with the same `Idempotency-Key`. The cursor for a run advances only when the acknowledgement names that run and an `acceptedThroughSequence` that covers the batch. Duplicate delivery of an acknowledged batch is the server's idempotency behavior. The client still sends the same id if it did not see the acknowledgement.

`401` is not retried by the foreground timer. The next manual `flush()` tries once. Other held responses (`400`, `409` history conflict, `413`, `422`) behave the same way.

## Retention

The journal remains the source of truth and is not trimmed by the exporter. Keep events at least through the acknowledged cursor. Deleting the workflow database without deleting the telemetry store can make a reused run id conflict in Cloud. Deleting only the telemetry store causes a full resync, which Cloud accepts when the event ids and payloads still match.

## Device identity

Each telemetry store has one installation id. Destinations are scoped by endpoint and ingestion key. Credential rotation does not merge cursors. It does keep the installation id, so Cloud can still attribute the device when the new key is for the same project and is not bound to a different installation.

Resetting the phone's workflow database should reset this store too. The React Native examples delete both files from Reset.

## What was not run here

`cloud.larkx.ai` did not resolve from the environment that added this package. Automated tests use a fake HTTP transport, a SQLite state file, and a Node `SIGKILL` against that file. A test in `tests/telemetry/live.test.ts` talks to a real Cloud origin when `LARKX_CLOUD_ENDPOINT` and `LARKX_INGESTION_KEY` are set. Those variables are not part of CI. No physical device uploaded a run as part of this change.
