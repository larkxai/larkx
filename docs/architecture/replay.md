# Replay

Replay is a second execution of the workflow function against stored facts.

```typescript
const a = await ctx.step("a", { execution: "local", effects: "pure", run: loadData });
const b = await ctx.step("b", { execution: "local", effects: "pure", run: () => analyze(a) });
const c = await ctx.step("c", {
  execution: "local",
  effects: "idempotent",
  run: ({ operationId }) => save(b, operationId),
});
```

If `a` and `b` committed and `c` was interrupted:

1. Load the run and the workflow with the stored name and version.
2. Call `run` with the stored input.
3. Return the stored output for `a` and for `b`. Their handlers are not called.
4. See that `c` is the interrupted last step. A pure or idempotent step becomes `RETRY_SCHEDULED`. A non-idempotent step blocks the run.
5. Execute `c` only when the policy allows it, then commit the workflow output.

## Divergence

The cursor is the step order. At each `ctx.step` the runtime expects the recorded key at that index, if one exists. A different key, a duplicate key at a new position, or a completed run that is asked to execute again through a changed function is `replay_divergence`. The run is `BLOCKED`. The new handler is not called.

Control flow may branch on stored input and stored step results. It may not branch on the clock, on `Math.random`, or on a live network read. Those values change between the first execution and the replay, so the cursor would disagree with history.

## Determinism the runtime enforces

The runtime cannot prove that a handler is pure. It enforces the boundary it can see:

- Step keys and order are part of the stored record, together with the effect type and execution target.
- A completed step's descriptor must match the options at the replayed call.
- Workflow code outside steps that needs time or a random number must use `ctx.now` and `ctx.random`, which append their own steps.
- JSON encoding is canonical, so input comparison does not depend on key order.

## What replay does not do

It does not resume a generator at an instruction pointer. It does not reconnect a native model session. It does not skip ahead in the function without running the JavaScript between steps. That JavaScript must be cheap and deterministic.
