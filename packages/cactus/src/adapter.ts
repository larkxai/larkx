import type {
  JsonSchema,
  ModelAdapter,
  ModelMessage,
  ModelRequest,
  ModelResponse,
  ModelToolDefinition,
  ToolCall,
} from "@larkxai/agent";
import { decodeJson, encodeJson, LarkxError } from "@larkxai/core";
import { isJsonObject, type JsonObject, type JsonValue } from "@larkxai/protocol";

import type { CactusCompletion, CactusLanguageModel, CactusMessage, CactusTool } from "./types.js";

export const CACTUS_DEFAULT_MODEL = "qwen3-0.6b";

/**
 * Normalize a Cactus completion into a LarkX model response.
 * Chain-of-thought (`thinking`) is dropped and is not returned.
 */
export function normalizeCactusCompletion(
  result: CactusCompletion,
  _modelId: string,
): ModelResponse {
  if (result.cloudHandoff === true) {
    throw permanent("Cactus requested a cloud handoff. Local execution does not follow it.");
  }
  if (!result.success) {
    throw new LarkxError({
      code: "transient_execution_failure",
      message: "Cactus completion failed.",
      retryable: true,
    });
  }
  const calls = (result.functionCalls ?? []).map((call, index) => normalizeCall(call, index));
  const response: ModelResponse = {
    message: result.response.length > 0 ? result.response : null,
    finish: calls.length > 0 ? "tool_calls" : "stop",
    calls,
    usage: {
      ...(finite(result.prefillTokens) ? { inputTokens: result.prefillTokens } : {}),
      ...(finite(result.decodeTokens) ? { outputTokens: result.decodeTokens } : {}),
      ...(finite(result.totalTokens) ? { totalTokens: result.totalTokens } : {}),
    },
    ...(finite(result.totalTimeMs)
      ? {
          timingMs: {
            total: result.totalTimeMs,
            ...(finite(result.timeToFirstTokenMs)
              ? { timeToFirstToken: result.timeToFirstTokenMs }
              : {}),
          },
        }
      : {}),
  };
  return response;
}

export function cactusAdapter(model: CactusLanguageModel): ModelAdapter {
  const modelId = model.getModelName();
  return {
    id: "cactus",
    model: modelId,
    capabilities: {
      toolCalling: true,
      structuredOutput: false,
      cancellation: true,
    },
    async complete(request, context) {
      if (context.signal.aborted) {
        throw cancelled();
      }
      const onAbort = (): void => {
        void model.stop().catch(() => undefined);
      };
      context.signal.addEventListener("abort", onAbort);
      try {
        const result = await model.complete({
          messages: toCactusMessages(request.messages),
          tools: request.tools.map(toCactusTool),
          options: {
            maxTokens: 512,
            forceTools: false,
            telemetryEnabled: false,
            confidenceThreshold: 0,
            toolRagTopK: Math.max(request.tools.length, 1),
            useVad: false,
            enableThinking: false,
          },
        });
        if (context.signal.aborted) {
          throw cancelled();
        }
        return normalizeCactusCompletion(result, modelId);
      } catch (error) {
        if (context.signal.aborted) {
          throw cancelled();
        }
        throw error;
      } finally {
        context.signal.removeEventListener("abort", onAbort);
      }
    },
  };
}

export function toCactusMessages(messages: readonly ModelMessage[]): CactusMessage[] {
  const formatted: CactusMessage[] = [];
  for (const message of messages) {
    if (message.role === "tool") {
      formatted.push({
        role: "user",
        content: `Tool ${message.name} (${message.callId}) result: ${message.content}`,
      });
      continue;
    }
    if (message.role === "assistant") {
      const calls = message.calls
        .map((call) => `${call.name} ${JSON.stringify(call.arguments)}`)
        .join("\n");
      const content = [message.content ?? "", calls].filter((part) => part.length > 0).join("\n");
      formatted.push({ role: "assistant", content });
      continue;
    }
    formatted.push({ role: message.role, content: message.content });
  }
  return formatted;
}

function toCactusTool(tool: ModelRequest["tools"][number]): CactusTool {
  return {
    name: tool.name,
    description: tool.description,
    parameters: {
      type: "object",
      properties: propertiesOf(tool.inputSchema.properties ?? {}),
      required: [...(tool.inputSchema.required ?? [])],
    },
  };
}

function propertiesOf(
  properties: Readonly<Record<string, { readonly type: string; readonly description?: string }>>,
): CactusTool["parameters"]["properties"] {
  const mapped: Record<string, { type: string; description: string }> = {};
  for (const [key, schema] of Object.entries(properties)) {
    mapped[key] = {
      type: schema.type,
      description: schema.description ?? "",
    };
  }
  return mapped;
}

function normalizeCall(
  call: { name: string; arguments: { readonly [key: string]: unknown } },
  index: number,
): ToolCall {
  if (typeof call.name !== "string" || call.name.length === 0) {
    throw permanent("Cactus returned a tool call without a name.");
  }
  return {
    id: `call-${String(index)}`,
    name: call.name,
    arguments: normalizeArguments(call.arguments),
  };
}

function normalizeArguments(value: unknown): JsonObject {
  const parsed = typeof value === "string" ? parseArguments(value) : value;
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw permanent("Cactus tool arguments must be a JSON object.");
  }
  let encoded: JsonValue;
  try {
    encoded = decodeJson(encodeJson(parsed));
  } catch (error) {
    if (error instanceof LarkxError) {
      throw permanent("Cactus tool arguments are not JSON.");
    }
    throw error;
  }
  if (!isJsonObject(encoded)) {
    throw permanent("Cactus tool arguments must be a JSON object.");
  }
  return encoded;
}

function parseArguments(value: string): unknown {
  try {
    return decodeJson(value);
  } catch (error) {
    if (error instanceof LarkxError) {
      throw permanent("Cactus tool arguments were not JSON.");
    }
    throw error;
  }
}

function finite(value: number): boolean {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function cancelled(): LarkxError {
  return new LarkxError({
    code: "cancelled_execution",
    message: "Cactus generation cancelled.",
    retryable: false,
  });
}

export interface NativeHostModel {
  readonly id: string;
  readonly model: string;
  readonly capabilities: {
    readonly toolCalling: boolean;
    readonly structuredOutput: boolean;
    readonly cancellation: boolean;
  };
  complete(
    request: { readonly messages: readonly JsonValue[]; readonly tools: readonly JsonValue[] },
    context: { readonly signal: AbortSignal },
  ): Promise<ModelResponse>;
  download(params?: { onProgress?: (progress: number) => void }): Promise<void>;
  init(): Promise<void>;
  stop(): Promise<void>;
  getModelName(): string;
}

/**
 * Adapt Cactus to the native host's JSON model request.
 * Cactus still only performs inference. The native runtime owns the agent loop.
 */
export function cactusHostModel(model: CactusLanguageModel): NativeHostModel {
  const adapter = cactusAdapter(model);
  return {
    id: adapter.id,
    model: adapter.model,
    capabilities: adapter.capabilities,
    download: (params) => model.download(params),
    init: () => model.init(),
    stop: () => model.stop(),
    getModelName: () => model.getModelName(),
    complete(request, context) {
      return adapter.complete(
        {
          messages: request.messages.map(readHostMessage),
          tools: request.tools.map(readHostTool),
        },
        context,
      );
    },
  };
}

function readHostMessage(value: JsonValue): ModelMessage {
  if (!isJsonObject(value) || typeof value.role !== "string") {
    throw permanent("Native model message must be an object with a role.");
  }
  if (value.role === "system" || value.role === "user") {
    if (typeof value.content !== "string") {
      throw permanent("Native model message content must be a string.");
    }
    return { role: value.role, content: value.content };
  }
  if (value.role === "assistant") {
    const calls = Array.isArray(value.calls)
      ? value.calls.flatMap((call) => {
          if (call === undefined) {
            return [];
          }
          return [readHostCall(call)];
        })
      : [];
    return {
      role: "assistant",
      content: typeof value.content === "string" ? value.content : null,
      calls,
    };
  }
  if (value.role === "tool") {
    if (
      typeof value.name !== "string" ||
      typeof value.callId !== "string" ||
      typeof value.content !== "string"
    ) {
      throw permanent("Native tool message is missing a name, call id, or content.");
    }
    return { role: "tool", name: value.name, callId: value.callId, content: value.content };
  }
  throw permanent(`Native model message role "${value.role}" is not supported.`);
}

function readHostCall(value: JsonValue): ToolCall {
  const args = isJsonObject(value) ? value.arguments : undefined;
  if (
    !isJsonObject(value) ||
    typeof value.id !== "string" ||
    typeof value.name !== "string" ||
    args === undefined ||
    !isJsonObject(args)
  ) {
    throw permanent("Native assistant call must include an id, name, and object arguments.");
  }
  return { id: value.id, name: value.name, arguments: args };
}

function readHostTool(value: JsonValue): ModelToolDefinition {
  if (
    !isJsonObject(value) ||
    typeof value.name !== "string" ||
    typeof value.description !== "string"
  ) {
    throw permanent("Native tool definition must include a name and description.");
  }
  const schema = value.inputSchema;
  if (schema === undefined || !isJsonObject(schema) || schema.type !== "object") {
    throw permanent(`Tool "${value.name}" is missing an object input schema.`);
  }
  return {
    name: value.name,
    description: value.description,
    inputSchema: schema as unknown as JsonSchema,
  };
}

function permanent(message: string): LarkxError {
  return new LarkxError({
    code: "permanent_execution_failure",
    message,
    retryable: false,
  });
}
