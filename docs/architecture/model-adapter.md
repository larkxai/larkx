# Model adapter

This document is a design note. There is no `@larkx/agent` package and no provider adapter in this repository.

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

Cactus is the planned first on-device adapter and must be written against the published SDK, not a guessed message format. Ollama is a reasonable Node development adapter. Neither is wired up. Agent tests should use a deterministic fake adapter so recovery tests do not depend on a model server.

The core's import boundary test fails if the engine starts referring to Cactus, Ollama, OpenAI, or Anthropic.
