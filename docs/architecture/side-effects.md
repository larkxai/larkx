# Side-effect safety

Exactly-once execution of an arbitrary external operation is not a LarkX guarantee. The effect can happen, and the process can die before the commit.

## Classes

### pure

Safe to repeat from the outside world's point of view. A local calculation and a read-only transform belong here.

### idempotent

Safe to repeat when the handler uses the `operationId`. The runtime allocates that id once per step and sends the same id on retry.

### non-idempotent

Unsafe to repeat automatically. If the step was running at recovery, the outcome is unknown. The step becomes `UNKNOWN_OUTCOME` and the run becomes `BLOCKED`.

Application code that can check the external system calls `run.reconcile`:

- `retry` when the effect did not happen.
- `complete` with the output the external system produced.
- `fail` when the run should stop.

## Cancellation

Cancellation does not compensate. A step that already committed stays committed. Handlers should watch `signal`.
