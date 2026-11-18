# Agents

`@larkx/agent` is a workflow written with `defineWorkflow`. It is not a second engine, a second log, or a second ownership system.

`createAgent` builds that workflow and registers it with `engine.register`. The same definition object can be registered again. A different object for the same name and version is rejected. `start` still requires the registered object, which is the one `createAgent` holds.

## Loop

The workflow appends a system message and the user message, then repeats:

1. `model-<iteration>` as an idempotent local step. The handler calls `ModelAdapter.complete`. Replay returns the stored decision and does not call the adapter.
2. For each call in that decision, `tool-<iteration>-<index>` as a local step. The effect class and retry policy come from the registered tool. An unknown name uses `pure` and stores an error. Invalid arguments store an error and do not call `run`.

Tool calls in one model decision run one after another. Parallel tool execution is not implemented. An unknown outcome on a non-idempotent tool rejects the step with `unknown_operation_outcome`. The workflow function stops there. A later model step cannot bypass it.

Step keys are chosen by the agent package. They are ordinary caller-supplied keys. They are not new protocol events.

## Startup and recovery

Register the agent before `recover()`:

```typescript
const engine = createNodeEngine({ database, workflows: [], heartbeat: false });
const agent = createAgent({ engine, name, version, model, instructions, tools });
await agent.recover();
```

The new process needs a compatible definition: same workflow name and version, same effect class for each step the run already recorded, and a model adapter only for steps that are not committed. Committed decisions already contain the tool calls the next steps will run.

Changing instructions or tool behavior without bumping `version` can make a replayed prompt disagree with a decision that was stored under the old instructions. Bump the version when the agent's behavior changes. The old run then blocks with `unknown_workflow_version` until an engine that still has the old definition resumes it.

Initialize a local model before starting a run. Model download is not a step. After a kill, call `recover()` only once the adapter can serve steps that have not committed. A committed decision does not need the model to be loaded in order to be replayed, but the next uncommitted model step does.

## What is stored

Model steps store provider id, model id, assistant text, finish reason, tool calls, and optional token counts and timing. They do not store chain-of-thought. Tool steps store the tool name, call id, JSON output, or a bounded error string. Those values live on step rows. The journal does not copy them. See the cloud observability spec.

Operation ids, leases, cancellation, and `UNKNOWN_OUTCOME` are the engine's. A tool receives `operationId`, `attempt`, `runId`, `stepKey`, and `signal` from the step context.

## Limits

The loop stops with `permanent_execution_failure` when it passes `maxIterations`, `maxToolCalls`, or `maxInvalidToolRequests`. `maxContextChars` is checked inside the model step, before `complete`. It is the length of the canonical JSON message list. It is not a tokenizer count and it is not the model's context window.

## Providers

`ModelAdapter` is the only inference surface. Capabilities are `toolCalling`, `structuredOutput`, and `cancellation`. The loop does not read provider-specific fields. `@larkx/cactus` is one adapter. `createScriptedModel` is the deterministic adapter used by tests and the React Native test mode.
