# Concepts

## Run

One execution of one agent version. The id is chosen by the caller. Reusing an id does not start a second execution.

## Step

A model decision or a tool call stored by the C++ runtime. The core assigns the key. A completed step is not executed again.

## Replay

Opening the same database and asking the core for the next request. Committed results come back from storage. See [Replay](../architecture/replay.md).

## Effect class

`pure`, `idempotent`, or `non-idempotent`. It tells recovery whether an interrupted step may run again. See [Side effects](../architecture/side-effects.md).

## Operation id

The id a handler uses to make an external write idempotent. It is stable across retries of that step.

## Ownership

The right to commit the next command for a run. Writes carry an owner id and an epoch. A stale owner cannot commit.

## Blocked

The run stopped because continuing would guess. An unknown non-idempotent outcome blocks. Call `reconcile`. `resume` alone does not move it.

## Data policy

`device-only` is the default. Remote work is not implemented.
