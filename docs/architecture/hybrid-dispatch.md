# Hybrid dispatch

This document is a design note. The 0.1.0 runtime does not dispatch remote work.

## Intent

`local` runs a function on this device. That function may still use the network. Local does not mean offline.

`cloud` names a remote handler. The device does not send a JavaScript closure.

`hybrid` chooses between an explicit local function and an explicit remote handler name. The choice is an execution policy decision. Once a target is committed, the runtime must not switch while the outcome is unknown.

## Request

A remote request carries the protocol version, tenant, application id, run id, workflow name and version, step key, operation id, handler name and version, attempt, input, and data policy. `@larkxai/protocol` validates that shape. `device-only` is rejected.

The operation id stays stable across transport retries.

## Outbox

The intended sequence:

1. Persist the outbox row and the step's waiting state in one storage transaction.
2. Send the request.
3. The coordinator deduplicates on the operation id.
4. The coordinator durably accepts the task.
5. A worker runs the registered handler.
6. The result is stored by the coordinator.
7. The device reads the result.
8. The device commits the step output and continues.

If the coordinator accepted the task and the acknowledgement was lost, the device retries with the same operation id. It does not start a local side-effecting fallback.

The `outbox` table and the `REMOTE_*` event names exist so this sequence has a place to land. The engine does not write them yet.

## Policies

A later policy object may look at connectivity, a local model, battery, thermal state, privacy, and cost. Those signals are not available as adapters. Until they are, the only honest policies are explicit local, explicit cloud, and a simple hybrid choice that is tested without claiming hardware awareness. The selected target must be stored and reused on replay.

## Privacy

Remote transfer requires the workflow, the application policy, and whatever user authorization the app adds. The strictest policy wins. Files and prompts are not attached implicitly. Worker credentials do not belong in a mobile binary. Device auth, when it exists, should be a short-lived token. None of that transport exists in this release.
