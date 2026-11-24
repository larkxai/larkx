# RFC 0002 — Execution semantics

Status: accepted for the 0.1.0 local runtime.

## Workflow function

`defineWorkflow` checks the name and version and returns the definition unchanged. Names match `^[a-z][a-z0-9-]{0,63}$`. Versions are integers greater than or equal to 1.

`run` is replayable control flow. It may branch and loop on the workflow input and on values returned by steps. It must not perform an unrecorded nondeterministic operation. Time and randomness go through `ctx.now(key)` and `ctx.random(key)`, which are durable pure steps with caller-supplied keys.

## Steps

A step key matches `^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$`. Keys are unique within a run. Order is the order of `ctx.step` calls during a replay. The first execution assigns that order. A later replay that asks for a different key at the same cursor fails with `replay_divergence` and blocks the run.

Only the local step form runs:

```typescript
await ctx.step(key, {
  execution: "local",
  effects,
  run: (ctx) => result,
  retry,
  timeoutMs,
});
```

`StepContext` carries `operationId`, `attempt`, `runId`, `stepKey`, `signal`, `workflowName`, and `workflowVersion`. The operation id is a random UUID created once for the step and reused for every attempt. It is not derived from the clock.

## Replay

Recovery loads the run and the registered definition with the same name and version. It then calls `run` from the beginning.

- A `COMPLETED` step returns the stored JSON output and does not call `run`.
- A `FAILED` step rethrows the stored error.
- An `UNKNOWN_OUTCOME` step throws `unknown_operation_outcome` and leaves the run blocked.
- A `RETRY_SCHEDULED` or `PENDING` step may execute.
- A `RUNNING` step at the end of the history is an interruption. `prepareInterrupted` runs before user code. `pure` and `idempotent` steps move to `RETRY_SCHEDULED` with the attempt marked `INTERRUPTED`. `non-idempotent` steps move to `UNKNOWN_OUTCOME` and the run moves to `BLOCKED`.

Completed workflows do not call `run` again. `result()` returns the stored output.

If the history has a gap, or a non-final step is unfinished, the run blocks with `history_integrity`.

## Effects

| Class            | Interrupted before commit        | Retryable thrown error                                           |
| ---------------- | -------------------------------- | ---------------------------------------------------------------- |
| `pure`           | Retry, up to the retry policy    | Retry, then fail the run                                         |
| `idempotent`     | Retry with the same operation id | Retry, then fail the run                                         |
| `non-idempotent` | `UNKNOWN_OUTCOME`, run `BLOCKED` | `UNKNOWN_OUTCOME` when the error is retryable, including timeout |

An explicit non-retryable `LarkxError` on a pure or idempotent step fails that step and the run. The handler is not retried.

Repeating a pure step can still cost time or money. Idempotency is only real if the handler uses the operation id to make the external write idempotent. The runtime does not inspect the handler.

`reconcileStep(runId, stepKey, resolution)` is the only way out of `UNKNOWN_OUTCOME`.

- `retry` moves the step to `RETRY_SCHEDULED` and the run to `RUNNING`. It does not resume by itself.
- `complete` requires an output, marks the step `COMPLETED`, and moves the run to `RUNNING`.
- `fail` marks the step and the run `FAILED`.

## Retry policy

The default policy is 3 attempts, 50 ms initial delay, 30 s maximum, exponential factor 2. The delay is computed from the attempt number and the injected clock. Tests use a fake clock so they do not wait on wall time.

A timeout is `Promise.race` against `clock.sleep`. A late handler rejection after the race settles is swallowed so it cannot surface as an unhandled rejection. The attempt is then classified like any other retryable failure.

## Failure and cancellation

`EngineTermination` stops the in-process loop without writing a failure. The step stays `RUNNING` if the handler already started and the result was not committed. The next resume treats that as an interruption. Process death is the real form of this; tests also throw `EngineTermination` between the handler and the commit.

`close()` sets the engine closed, waits for loops, and releases ownership. It does not fail the run. The run stays recoverable. Do not call `close()` from a hook: the hook runs inside the loop that `close()` is waiting for.

Cancellation sets `cancel_requested` and aborts the run's `AbortSignal`. The workflow throws `cancelled_execution` at the next step boundary. An in-flight handler that returns after the signal has aborted is recorded as `CANCELLED` rather than committed. A handler that ignores the signal can still perform an external effect. Committed effects are not rolled back.

`CREATED` may move directly to `BLOCKED` when the registered definition or the protocol version cannot start the run. `CREATED` may also move to `CANCELLED`.

## JSON

Stored payloads use canonical JSON with sorted object keys. The encoder rejects `undefined`, `NaN`, infinities, `bigint`, functions, symbols, and objects that are not plain records or arrays. A step or workflow that returns `undefined` is stored as `null`.

Two starts are the same input only when their canonical encodings match. A second `start` with a different encoding throws `incompatible_run` and does not create another execution.

## Ownership during replay

`start`, `resume`, and `recover` serialize on an in-process per-run lock and then claim storage. If the claim fails, the loop exits and `result()` reports `execution_ownership_conflict` while the run is still non-terminal. The owner that holds the lease keeps executing.

`result()` waits for the local loop if one exists, then reads storage. `COMPLETED` resolves. `FAILED`, `BLOCKED`, and `CANCELLED` reject with a `LarkxError`. A non-terminal run with no local loop rejects with `execution_ownership_conflict`.

## Events

Each successful reducer command appends events in the same transaction. Sequence numbers are contiguous per run. Payloads are small metadata. Sensitive keys are rejected. Subscribers see events published after they are stored. A subscriber is not a durability mechanism.

`WORKFLOW_WAITING` and the remote dispatch event names are in the protocol. The local runtime does not emit them.

## Open questions

These are unresolved. The current code picks the behavior described above until a later RFC changes it.

1. A non-idempotent handler that throws a retryable error is treated as `UNKNOWN_OUTCOME`, because the runtime cannot know whether the effect happened. Callers who know the effect did not happen can pass `retryable: false` only on pure or idempotent steps today. A distinct "definitely did not happen" signal for non-idempotent work is not defined.
2. `node:sqlite` is experimental. A later adapter may use `better-sqlite3` or another driver behind `SqliteDriver` if the experimental module becomes a problem. The schema should stay put.
3. A 30 second lease is a poor match for a suspended mobile process. M2 needs a lifecycle story before the default lease is treated as a mobile guarantee. The Node pid file does not exist on React Native.
4. The `@larkx` npm scope is the publish target. Ownership is confirmed by the first successful publish from the `release` job. Until that publish succeeds, treat the scope as unconfirmed.
5. `FAILED` runs are terminal. The supported recovery is a new run id. It is open whether a future explicit restart should clone history instead.
6. Artifact rows do not yet copy bytes. A durable image or model file still needs a lifetime rule so a camera cache URI is not stored as if it were permanent.
7. Blocked runs whose workflow version is missing can be cancelled. A migration that maps an old history onto a new definition is not specified, and it must not be implicit.
8. Heartbeats use `setTimeout`. A suspended JavaScript environment will not renew a lease. Expiry during suspension must not allow a second live owner on the same device.
