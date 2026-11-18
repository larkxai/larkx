# Model adapter

`ModelAdapter` lives in `@larkx/agent`. `@larkx/cactus` is the Cactus implementation. The engine does not import either package.

## Role

A model adapter is how an agent asks a specific runtime to complete a prompt. The durable engine does not import it. The agent layer will call it from inside a durable step and store the operational response.

Conceptual shape:

```typescript
interface ModelAdapter {
  readonly id: string;
  complete(request: ModelRequest, context: ModelExecutionContext): Promise<ModelResponse>;
}
```

`ModelResponse` should be able to carry:

- The final response content.
- Structured tool calls.
- A finish reason.
- Optional provider metadata.
- Optional usage.
- Optional confidence or fallback signals.
- The model identity.

Confidence is optional. Many providers do not have it.

## What is stored

Store the messages, the structured tool calls, the tool results, and the final response that the next iteration needs. Do not store private chain-of-thought.

A committed model step is replayed. The adapter is not called again for that step. Tool calls are later steps. They are validated against the tools the application registered. A model-supplied name that was not registered does not become a function call.

## Providers

Cactus is implemented in `@larkx/cactus` against `cactus-react-native` 1.13.1. The calls are `download`, `init`, `complete`, `stop`, and `getModelName`. See that package README for the options that keep inference local. Ollama is not wired. RunAnywhere and LangGraph are not scheduled.

`createScriptedModel` is the deterministic adapter. Recovery tests use it so they do not need a device or a downloaded model.

The core's import boundary test fails if the engine starts referring to Cactus, Ollama, OpenAI, or Anthropic. The agent package has the same import boundary.
