import { LarkxError, type RetryPolicy } from "@larkxai/core";
import type { EffectType, JsonValue } from "@larkxai/protocol";

import type { JsonSchema } from "./schema.js";

const TOOL_NAME = /^[a-z][a-z0-9_]{0,63}$/;

export interface ToolContext {
  readonly operationId: string;
  readonly attempt: number;
  readonly runId: string;
  readonly stepKey: string;
  readonly signal: AbortSignal;
}

export interface Tool {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: JsonSchema;
  readonly effects: EffectType;
  readonly retry?: RetryPolicy;
  readonly run: (input: JsonValue, context: ToolContext) => Promise<JsonValue> | JsonValue;
}

export function defineTool<TInput, TOutput extends JsonValue>(definition: {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: JsonSchema;
  readonly effects: EffectType;
  readonly retry?: RetryPolicy;
  readonly run: (input: TInput, context: ToolContext) => Promise<TOutput> | TOutput;
}): Tool {
  if (!TOOL_NAME.test(definition.name)) {
    throw invalid(`Tool name "${definition.name}" must match ${TOOL_NAME.source}.`);
  }
  if (definition.description.trim().length === 0) {
    throw invalid(`Tool "${definition.name}" needs a description.`);
  }
  if (definition.inputSchema.type !== "object") {
    throw invalid(`Tool "${definition.name}" input schema must be an object.`);
  }
  if (
    definition.effects !== "pure" &&
    definition.effects !== "idempotent" &&
    definition.effects !== "non-idempotent"
  ) {
    throw invalid(`Tool "${definition.name}" has an unknown effect class.`);
  }
  if (definition.retry !== undefined) {
    assertRetry(definition.name, definition.retry);
  }
  return {
    name: definition.name,
    description: definition.description,
    inputSchema: definition.inputSchema,
    effects: definition.effects,
    ...(definition.retry !== undefined ? { retry: definition.retry } : {}),
    run: (input, context) => definition.run(input as TInput, context),
  };
}

function assertRetry(name: string, policy: RetryPolicy): void {
  if (!Number.isInteger(policy.maxAttempts) || policy.maxAttempts < 1) {
    throw invalid(`Tool "${name}" retry maxAttempts must be an integer >= 1.`);
  }
  if (
    policy.initialIntervalMs < 0 ||
    policy.maxIntervalMs < policy.initialIntervalMs ||
    (policy.backoff !== "fixed" && policy.backoff !== "exponential")
  ) {
    throw invalid(`Tool "${name}" retry policy is invalid.`);
  }
}

function invalid(message: string): LarkxError {
  return new LarkxError({
    code: "invalid_workflow_definition",
    message,
    retryable: false,
  });
}
