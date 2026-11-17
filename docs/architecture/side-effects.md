# Side-effect safety

Exactly-once execution of an arbitrary external operation is not a LarkX guarantee. The crash window is real: the effect can happen, and the process can die before the commit.

## Classes

### pure

Safe to repeat from the outside world's point of view. Local inference, a calculation, and a read-only transform belong here. The work can still be expensive. The default retry policy limits attempts.

### idempotent

Safe to repeat when the handler actually enforces the `operationId`. A database upsert keyed by that id is the usual case. Retrying a handler that ignores the id is not idempotent, whatever the label says.

The operation id is allocated once per step and stored on the step row. Network-style retries of a future remote dispatch must reuse it. They must not mint a new id per HTTP call.

### non-idempotent

Unsafe to repeat automatically. Mail without deduplication, a charge without an idempotency key, and a physical actuator belong here.

If the step was `RUNNING` at recovery, the outcome is unknown. The step becomes `UNKNOWN_OUTCOME` and the run becomes `BLOCKED`. A retryable exception or a timeout during the handler is treated the same way, because the runtime cannot see whether the effect started.

The operator, or application code that can check the external system, calls `reconcileStep`:

- `retry` after an outcome check that found the effect did not happen.
- `complete` with the output the external system actually produced.
- `fail` when the run should stop.

## Same database as the journal

A future adapter may commit a business write and the step result in one transaction when they share a database. That is a stronger guarantee than an external HTTP call. It is not implemented as a general hook. Application code that wants it today should do the business write in a store it controls and use an idempotent step whose operation id is the primary key.

## Cancellation

Cancellation does not compensate. A step that already committed stays committed. A non-idempotent handler that keeps running after the abort signal can still change the outside world while the step record says `CANCELLED`. Handlers should watch `signal`.
