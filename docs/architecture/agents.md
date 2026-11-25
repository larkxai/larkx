# Agents

An agent is a named, versioned definition: instructions, a model, and tools. The C++ runtime stores each model decision and each tool result as a step. The host does not choose the step key.

Register the definition again after a process restart before resuming a run. The name and version must match the stored run. A different model id than the one stored on a committed decision is rejected.

`defineTool` records the effect class:

- `pure` and `idempotent` interrupted calls may run again.
- `idempotent` retries keep the operation id the runtime assigned.
- `non-idempotent` interrupted calls block the run until `reconcile`.

The label is not a proof. An idempotent tool still has to use the operation id.

LarkX is this agent runtime. It does not offer a general workflow function, caller-supplied step keys, or a second loop.
