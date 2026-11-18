# @larkx/agent

Durable agents on the existing LarkX workflow engine.

This package does not import React Native, Expo, Node.js, or a model provider. A model is a `ModelAdapter`. A tool is a normal local step. Recovery uses the same workflow version and the same step keys.

## Minimal agent

```typescript
import { createAgent, createScriptedModel, defineTool } from "@larkx/agent";
import { createNodeEngine } from "@larkx/node";

const savePlan = defineTool({
  name: "save_plan",
  description: "Save a renovation plan locally",
  inputSchema: {
    type: "object",
    properties: { title: { type: "string" } },
    required: ["title"],
    additionalProperties: false,
  },
  effects: "idempotent",
  run: (input, ctx) => ({ id: ctx.operationId, title: input.title }),
});

const engine = createNodeEngine({ database: "agent.db", workflows: [], heartbeat: false });
const agent = createAgent({
  engine,
  name: "renovation-agent",
  version: 1,
  model: createScriptedModel({
    respond: () => ({ message: "Saved.", finish: "stop", calls: [] }),
  }),
  instructions: "You are a home renovation assistant.",
  tools: [savePlan],
  maxIterations: 8,
});

const run = await agent.start({
  id: "renovation-001",
  input: { message: "Redesign my living room for $2,000" },
});
const result = await run.result();
```

`createAgent` registers `agent.workflow` on the engine. `start` and `result` are the engine's run handle. `agent.recover()` is `engine.recover()`.

On the next process, construct the engine, call `createAgent` again with the same name, version, tool effect classes, and step structure, then `recover()`. A different version does not replay the old run. Changing a tool's effect class on the same version blocks the run with `replay_divergence`.

## What is durable

Each iteration stores `model-<n>`. Each tool call in that decision stores `tool-<n>-<m>`, in order, one at a time. A committed model step is returned from storage. The adapter is not called again. A committed tool step does not call `run` again. An interrupted idempotent model call may run again. An interrupted non-idempotent tool becomes `UNKNOWN_OUTCOME` and the run stays `BLOCKED` until `reconcileStep`. The next model step does not run while that tool is unresolved.

The stored model decision is the message, the finish reason, the tool calls, and optional usage and timing. Chain-of-thought is not stored. Tool arguments are validated against the registered schema before `run`. An unknown name or invalid arguments becomes a committed tool error, up to `maxInvalidToolRequests`. Nothing in the model response is evaluated as code.

## Limits

`maxIterations` defaults to 8. `maxToolCalls` defaults to 16. `maxInvalidToolRequests` defaults to 3. `maxContextChars` defaults to 12000 and measures the canonical JSON of the reconstructed message list, not tokenizer tokens. Exceeding a limit fails the run. It does not drop committed steps.

## Providers

Implement `ModelAdapter.complete`. Declare `toolCalling`, `structuredOutput`, and `cancellation`. The loop only calls `complete`. Cactus lives in `@larkx/cactus`. Tests use `createScriptedModel`.
