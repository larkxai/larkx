# Concepts

Short definitions for the words the runtime uses. The execution RFC is the normative description.

## Run

One execution of one workflow version with one stored input. The id is chosen by the caller. Reusing an id does not start a second execution.

## Step

A durable operation with a stable key. The handler runs only when the stored step is not already completed. The recovery unit is the committed step, not the call stack.

## Replay

Calling the workflow function again after a crash or a resume. Completed steps return stored outputs.

## Effect class

`pure`, `idempotent`, or `non-idempotent`. It tells recovery whether an interrupted step may run again. See [Side effects](../architecture/side-effects.md).

## Operation id

The id a handler uses to make an external write idempotent. It is stable across retries of that step.

## Ownership

The right to commit the next command for a run. At most one owner. A fence (owner id plus epoch) is checked on every write.

## Blocked

The run stopped because continuing would guess. Unknown side effects, a missing workflow version, a protocol mismatch, and replay divergence all block. Reconcile or cancel. Do not expect `resume` alone to move a blocked run.

## Agent

A workflow whose steps are model decisions and tool calls. The agent package chooses the step keys. The engine stores the results. See [Agents](../architecture/agents.md).

## Data policy

`device-only` or `cloud-allowed`. The stricter one wins. The default is `device-only`.
