# Replay

Replay walks the steps the C++ runtime already committed.

1. Open the same SQLite file.
2. Register the same agent name and version.
3. `runtime.resume(runId)` asks the core for the next request.
4. A committed model decision is returned to the core as the stored decision. The model is not called again.
5. A committed tool result is not produced again. The handler is not called.
6. An interrupted `pure` or `idempotent` step is requested again with the same operation id.
7. An interrupted `non-idempotent` step blocks the run. The handler is not called until `reconcile` says to retry.

The scripted crash demo in `examples/node-agent` uses the message history so a new process still chooses the next tool from committed results. A positional script that always starts at index 0 is only safe when the process never dies between decisions.

Replay does not resume a native model session or a KV cache. An interrupted model call runs again from the last committed step.
