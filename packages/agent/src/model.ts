import { LarkxError } from "@larkx/core";
import type { JsonObject, JsonValue } from "@larkx/protocol";

import type { JsonSchema } from "./schema.js";

export type FinishReason = "stop" | "tool_calls" | "length" | "error";

export interface ToolCall {
  readonly id: string;
  readonly name: string;
  readonly arguments: JsonObject;
}

export interface ModelMessageSystem {
  readonly role: "system";
  readonly content: string;
}

export interface ModelMessageUser {
  readonly role: "user";
  readonly content: string;
}

export interface ModelMessageAssistant {
  readonly role: "assistant";
  readonly content: string | null;
  readonly calls: readonly ToolCall[];
}

export interface ModelMessageTool {
  readonly role: "tool";
  readonly name: string;
  readonly callId: string;
  readonly content: string;
}

export type ModelMessage =
  ModelMessageSystem | ModelMessageUser | ModelMessageAssistant | ModelMessageTool;

export interface ModelToolDefinition {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: JsonSchema;
}

export interface ModelUsage {
  readonly inputTokens?: number;
  readonly outputTokens?: number;
  readonly totalTokens?: number;
}

export interface ModelTiming {
  readonly total: number;
  readonly timeToFirstToken?: number;
}

export interface ModelRequest {
  readonly messages: readonly ModelMessage[];
  readonly tools: readonly ModelToolDefinition[];
}

export interface ModelContext {
  readonly signal: AbortSignal;
}

export interface ModelCapabilities {
  readonly toolCalling: boolean;
  readonly structuredOutput: boolean;
  readonly cancellation: boolean;
}

export interface ModelResponse {
  readonly message: string | null;
  readonly finish: FinishReason;
  readonly calls: readonly ToolCall[];
  readonly usage?: ModelUsage;
  readonly timingMs?: ModelTiming;
}

export interface StoredModelDecision {
  readonly provider: string;
  readonly model: string;
  readonly message: string | null;
  readonly finish: FinishReason;
  readonly calls: readonly ToolCall[];
  readonly usage?: ModelUsage;
  readonly timingMs?: ModelTiming;
}

export interface ModelAdapter {
  readonly id: string;
  readonly model: string;
  readonly capabilities: ModelCapabilities;
  complete(request: ModelRequest, context: ModelContext): Promise<ModelResponse>;
}

export interface ScriptedModel extends ModelAdapter {
  readonly invocations: number;
}

const FINISH_REASONS = new Set<FinishReason>(["stop", "tool_calls", "length", "error"]);

export function createScriptedModel(options: {
  readonly id?: string;
  readonly model?: string;
  readonly capabilities?: Partial<ModelCapabilities>;
  respond(request: ModelRequest, context: ModelContext): Promise<ModelResponse> | ModelResponse;
}): ScriptedModel {
  let invocations = 0;
  const capabilities: ModelCapabilities = {
    toolCalling: options.capabilities?.toolCalling ?? true,
    structuredOutput: options.capabilities?.structuredOutput ?? false,
    cancellation: options.capabilities?.cancellation ?? true,
  };
  return {
    id: options.id ?? "scripted",
    model: options.model ?? "scripted-1",
    capabilities,
    get invocations() {
      return invocations;
    },
    async complete(request, context) {
      invocations += 1;
      if (context.signal.aborted) {
        throw cancelled();
      }
      return options.respond(request, context);
    },
  };
}

export function cancelled(): LarkxError {
  return new LarkxError({
    code: "cancelled_execution",
    message: "Model call cancelled.",
    retryable: false,
  });
}

export function permanent(message: string): LarkxError {
  return new LarkxError({
    code: "permanent_execution_failure",
    message,
    retryable: false,
  });
}

export function isFinishReason(value: unknown): value is FinishReason {
  return typeof value === "string" && FINISH_REASONS.has(value as FinishReason);
}

export function readJsonObject(value: JsonValue, label: string): JsonObject {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw permanent(`${label} must be a JSON object.`);
  }
  return value;
}
