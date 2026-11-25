import type { JsonObject, JsonValue } from "@larkxai/protocol";

export interface JsonSchema {
  readonly type: "object" | "string" | "number" | "integer" | "boolean" | "array" | "null";
  readonly description?: string;
  readonly properties?: Readonly<Record<string, JsonSchema>>;
  readonly required?: readonly string[];
  readonly additionalProperties?: boolean;
  readonly items?: JsonSchema;
  readonly enum?: readonly JsonValue[];
}

export interface ToolCall {
  readonly id: string;
  readonly name: string;
  readonly arguments: JsonObject;
}

export type ModelMessage =
  | { readonly role: "system"; readonly content: string }
  | { readonly role: "user"; readonly content: string }
  | {
      readonly role: "assistant";
      readonly content: string | null;
      readonly calls: readonly ToolCall[];
    }
  | {
      readonly role: "tool";
      readonly name: string;
      readonly callId: string;
      readonly content: string;
    };

export interface ModelToolDefinition {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: JsonSchema;
}

export interface ModelRequest {
  readonly messages: readonly ModelMessage[];
  readonly tools: readonly ModelToolDefinition[];
}

export interface ModelContext {
  readonly signal: AbortSignal;
}

export interface ModelResponse {
  readonly message: string | null;
  readonly finish: "stop" | "tool_calls" | "length" | "error";
  readonly calls: readonly ToolCall[];
  readonly usage?: {
    readonly inputTokens?: number;
    readonly outputTokens?: number;
    readonly totalTokens?: number;
  };
  readonly timingMs?: {
    readonly total: number;
    readonly timeToFirstToken?: number;
  };
}

export interface ModelAdapter {
  readonly id: string;
  readonly model: string;
  readonly capabilities: {
    readonly toolCalling: boolean;
    readonly structuredOutput: boolean;
    readonly cancellation: boolean;
  };
  complete(request: ModelRequest, context: ModelContext): Promise<ModelResponse>;
}
