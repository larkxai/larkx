# Cloud changes required later

Nothing in `larkxai/cloud` changes in this milestone. The host posts metadata-only batches from the native journal when the application passes telemetry. Local execution must keep working when Cloud is absent or the export fails. Cloud still has to accept storage schema 3 before those batches ingest.

## Keep telemetry version 1

The exporter sends metadata-only batches to `POST /v1/telemetry/batches`. Those batches use telemetry version 1, protocol version 1, and storage schema version 3. Existing event types stay on that contract:

- `source` already carries `sdkVersion`, `platform`, `osName`, `osVersion`, and `deviceModel`.
- Run lifecycle, step, attempt, recovery, and reconciliation events already have names in protocol version 1.
- The exporter allowlist in `packages/telemetry/src/project.ts` drops prompts, model responses, tool inputs, tool outputs, and the other sensitive keys. Empty allowlists for `REMOTE_DISPATCH_QUEUED`, `REMOTE_DISPATCH_ACCEPTED`, and `REMOTE_RESULT_RECEIVED` mean those events export no payload fields.
- Durable cursors already live in the TypeScript exporter. A native exporter needs the same cursor behavior. A failed batch must not block the run.

## Do not treat Cloud as an execution API

Cloud ingestion records batches. It does not start a run, retry a step, reconcile an unknown outcome, cancel a run, or own a device lease. The native remote-delegation lifecycle is a device concern. A lost remote acknowledgement is resolved on the device, or left `UNKNOWN_OUTCOME`. Cloud must not invent a retry for it.

## Payload policy

The SDK journal rejects the sensitive names `input`, `output`, `messages`, `prompt`, `toolResult`, and `content` at the top level of an event payload. Cloud's `findSensitiveKey` rejects those names anywhere in the payload tree, then stores every other payload field it was given.

That is wider than the exporter allowlist. A later Cloud change should reject payload keys that are not on the telemetry allowlist for that event type, instead of storing unknown extras. Do that as a compatible tightening for telemetry version 1 only if current fixtures still pass. If a stored extra field is already accepted in production, bump the telemetry version rather than silently dropping it.

## New remote-agent events need a version bump

The device remote-delegation lifecycle specified for a later phase is:

`queued`, `submitting`, `accepted`, `working`, `input_required`, `completed`, `failed`, `cancelled`, `unknown_outcome`.

Those states are not protocol version 1 event types. Adding them to the journal, and exporting them, requires a new protocol version and a new telemetry version together. Until that version exists:

- Do not add the states to the current Cloud event enum.
- Do not put remote task payloads, prompts, tool results, or credentials in a batch.
- Keep the client operation id and the remote task id as distinct metadata fields when the versioned event is designed. The task id is unknown until the peer accepts the task.

Installation registration can stay on the current `source` object. A native runtime value such as `swift` or `kotlin` needs to be added to Cloud's runtime enum in the same version bump that first sends it. Do not overload `node` or `react-native` for a pure Swift or Kotlin process.
