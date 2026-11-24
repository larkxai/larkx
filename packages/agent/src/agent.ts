import {
  decodeJson,
  defineWorkflow,
  encodeJson,
  LarkxError,
  type Engine,
  type RetryPolicy,
  type RunHandle,
  type StartRequest,
  type WorkflowDefinition,
} from "@larkxai/core";
import { isJsonObject, type JsonValue } from "@larkxai/protocol";

import {
  isFinishReason,
  permanent,
  type FinishReason,
  type ModelAdapter,
  type ModelMessage,
  type ModelResponse,
  type ModelTiming,
  type ModelUsage,
  type StoredModelDecision,
  type ToolCall,
} from "./model.js";
import { validateJsonSchema } from "./schema.js";
import type { Tool, ToolContext } from "./tool.js";

export interface AgentRequest {
  readonly message: string;
}

export interface AgentResult {
  readonly message: string;
  readonly finish: "stop" | "length";
  readonly iterations: number;
  readonly toolCalls: number;
}

export interface ToolStepResult {
  readonly ok: boolean;
  readonly name: string;
  readonly callId: string;
  readonly output: JsonValue | null;
  readonly error: string | null;
}

export interface AgentOptions {
  readonly engine: Engine;
  readonly name: string;
  readonly version: number;
  readonly model: ModelAdapter;
  readonly instructions: string;
  readonly tools?: readonly Tool[];
  readonly maxIterations?: number;
  readonly maxToolCalls?: number;
  readonly maxInvalidToolRequests?: number;
  readonly maxContextChars?: number;
  readonly modelRetry?: RetryPolicy;
}

export interface Agent {
  readonly name: string;
  readonly version: number;
  readonly workflow: WorkflowDefinition<AgentRequest, AgentResult>;
  start(request: StartRequest<AgentRequest>): Promise<RunHandle<AgentResult>>;
  recover(): Promise<RunHandle<unknown>[]>;
}

interface Limits {
  readonly maxIterations: number;
  readonly maxToolCalls: number;
  readonly maxInvalidToolRequests: number;
  readonly maxContextChars: number;
  readonly modelRetry: RetryPolicy;
}

const DEFAULT_MODEL_RETRY: RetryPolicy = {
  maxAttempts: 2,
  initialIntervalMs: 10,
  maxIntervalMs: 10,
  backoff: "fixed",
};

export function createAgent(options: AgentOptions): Agent {
  if (options.instructions.trim().length === 0) {
    throw permanent("Agent instructions are empty.");
  }
  if (options.model.id.trim().length === 0 || options.model.model.trim().length === 0) {
    throw permanent("The model adapter needs an id and a model name.");
  }
  const tools = new Map<string, Tool>();
  for (const tool of options.tools ?? []) {
    if (tools.has(tool.name)) {
      throw new LarkxError({
        code: "invalid_workflow_definition",
        message: `Tool "${tool.name}" is registered more than once.`,
        retryable: false,
      });
    }
    tools.set(tool.name, tool);
  }
  const advertised = [...tools.values()].map((tool) => ({
    name: tool.name,
    description: tool.description,
    inputSchema: tool.inputSchema,
  }));
  const limits: Limits = {
    maxIterations: integerAtLeast(options.maxIterations, 8, "maxIterations"),
    maxToolCalls: integerAtLeast(options.maxToolCalls, 16, "maxToolCalls"),
    maxInvalidToolRequests: integerAtLeast(
      options.maxInvalidToolRequests,
      3,
      "maxInvalidToolRequests",
    ),
    maxContextChars: integerAtLeast(options.maxContextChars, 12_000, "maxContextChars"),
    modelRetry: options.modelRetry ?? DEFAULT_MODEL_RETRY,
  };
  const workflow = defineWorkflow<AgentRequest, AgentResult>({
    name: options.name,
    version: options.version,
    dataPolicy: "device-only",
    async run(ctx, input) {
      if (typeof input.message !== "string" || input.message.trim().length === 0) {
        throw permanent("Agent input message must be a non-empty string.");
      }
      const messages: ModelMessage[] = [
        { role: "system", content: options.instructions },
        { role: "user", content: input.message },
      ];
      let toolCalls = 0;
      let invalid = 0;
      for (let iteration = 0; iteration < limits.maxIterations; iteration += 1) {
        const decision = readDecision(
          await ctx.step(`model-${String(iteration)}`, {
            execution: "local",
            effects: "idempotent",
            retry: limits.modelRetry,
            run: async ({ signal }) => {
              if (encodeJson(messages).length > limits.maxContextChars) {
                throw permanent("Context limit exceeded.");
              }
              if (advertised.length > 0 && !options.model.capabilities.toolCalling) {
                throw new LarkxError({
                  code: "unsupported_capability",
                  message: `Model "${options.model.model}" does not support tool calls.`,
                  retryable: false,
                });
              }
              const response = await options.model.complete(
                { messages, tools: advertised },
                { signal },
              );
              return normalizeDecision(options.model, response, iteration);
            },
          }),
        );
        if (decision.finish === "stop" || decision.finish === "length") {
          return {
            message: decision.message ?? "",
            finish: decision.finish,
            iterations: iteration + 1,
            toolCalls,
          };
        }
        messages.push({
          role: "assistant",
          content: decision.message,
          calls: decision.calls,
        });
        for (let index = 0; index < decision.calls.length; index += 1) {
          if (toolCalls >= limits.maxToolCalls) {
            throw permanent("Tool call limit reached.");
          }
          const call = decision.calls[index];
          if (call === undefined) {
            throw permanent("Tool call list changed during execution.");
          }
          const tool = tools.get(call.name);
          const result = readToolResult(
            await ctx.step(`tool-${String(iteration)}-${String(index)}`, {
              execution: "local",
              effects: tool?.effects ?? "pure",
              ...(tool?.retry !== undefined ? { retry: tool.retry } : {}),
              run: (step) => executeTool(call, tool, step),
            }),
          );
          toolCalls += 1;
          messages.push({
            role: "tool",
            name: result.name,
            callId: result.callId,
            content: result.ok
              ? `Untrusted tool output: ${encodeJson(result.output)}`
              : `Tool error: ${result.error ?? "The tool rejected the call."}`,
          });
          if (!result.ok) {
            invalid += 1;
            if (invalid >= limits.maxInvalidToolRequests) {
              throw permanent("Invalid tool request limit reached.");
            }
          } else {
            invalid = 0;
          }
        }
      }
      throw permanent("Agent iteration limit reached.");
    },
  });
  options.engine.register(workflow);
  return {
    name: options.name,
    version: options.version,
    workflow,
    start: (request) => options.engine.start(workflow, request),
    recover: () => options.engine.recover(),
  };
}

async function executeTool(
  call: ToolCall,
  tool: Tool | undefined,
  step: ToolContext,
): Promise<ToolStepResult> {
  if (tool === undefined) {
    return {
      ok: false,
      name: call.name,
      callId: call.id,
      output: null,
      error: `Unknown tool "${call.name.slice(0, 80)}".`,
    };
  }
  const error = validateJsonSchema(tool.inputSchema, call.arguments);
  if (error) {
    return {
      ok: false,
      name: call.name,
      callId: call.id,
      output: null,
      error: `Invalid arguments for "${tool.name}": ${error}`,
    };
  }
  const raw = await tool.run(call.arguments, {
    operationId: step.operationId,
    attempt: step.attempt,
    runId: step.runId,
    stepKey: step.stepKey,
    signal: step.signal,
  });
  return {
    ok: true,
    name: call.name,
    callId: call.id,
    output: JSON.parse(encodeJson(raw)) as JsonValue,
    error: null,
  };
}

function normalizeDecision(
  model: ModelAdapter,
  response: ModelResponse,
  iteration: number,
): StoredModelDecision {
  if (!isFinishReason(response.finish)) {
    throw permanent("Model finish reason is not supported.");
  }
  if (response.message !== null && typeof response.message !== "string") {
    throw permanent("Model message must be a string or null.");
  }
  if (!Array.isArray(response.calls)) {
    throw permanent("Model tool calls must be an array.");
  }
  if (response.finish === "error") {
    throw permanent(response.message ?? "Model returned an error.");
  }
  if (response.finish === "tool_calls" && response.calls.length === 0) {
    throw permanent("Model requested tool calls but did not name any.");
  }
  if (response.finish !== "tool_calls" && response.calls.length > 0) {
    throw permanent("Model returned tool calls without finish reason tool_calls.");
  }
  const calls = response.calls.map((call, index) => normalizeCall(call, iteration, index));
  const decision: StoredModelDecision = {
    provider: model.id,
    model: model.model,
    message: response.message,
    finish: response.finish,
    calls,
    ...(response.usage !== undefined ? { usage: cleanUsage(response.usage) } : {}),
    ...(response.timingMs !== undefined ? { timingMs: cleanTiming(response.timingMs) } : {}),
  };
  return readDecision(JSON.parse(encodeJson(decision)) as JsonValue);
}

function normalizeCall(call: ToolCall, iteration: number, index: number): ToolCall {
  if (call === null || typeof call !== "object" || typeof call.name !== "string") {
    throw permanent("A model tool call is missing a name.");
  }
  if (call.name.length === 0 || call.name.length > 80) {
    throw permanent("A model tool call name is empty or too long.");
  }
  if (
    typeof call.arguments !== "object" ||
    call.arguments === null ||
    Array.isArray(call.arguments)
  ) {
    throw permanent(`Tool "${call.name}" arguments must be a JSON object.`);
  }
  const id =
    typeof call.id === "string" && call.id.length > 0
      ? call.id
      : `call-${String(iteration)}-${String(index)}`;
  if (id.length > 200) {
    throw permanent("A model tool call id is too long.");
  }
  return { id, name: call.name, arguments: call.arguments };
}

function cleanUsage(
  usage: NonNullable<ModelResponse["usage"]>,
): NonNullable<ModelResponse["usage"]> {
  const cleaned: { inputTokens?: number; outputTokens?: number; totalTokens?: number } = {};
  if (isCount(usage.inputTokens)) {
    cleaned.inputTokens = usage.inputTokens;
  }
  if (isCount(usage.outputTokens)) {
    cleaned.outputTokens = usage.outputTokens;
  }
  if (isCount(usage.totalTokens)) {
    cleaned.totalTokens = usage.totalTokens;
  }
  return cleaned;
}

function cleanTiming(
  timing: NonNullable<ModelResponse["timingMs"]>,
): NonNullable<ModelResponse["timingMs"]> {
  if (!isCount(timing.total)) {
    throw permanent("Model timing is not a finite number.");
  }
  return {
    total: timing.total,
    ...(isCount(timing.timeToFirstToken) ? { timeToFirstToken: timing.timeToFirstToken } : {}),
  };
}

function isCount(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function readDecision(value: unknown): StoredModelDecision {
  if (!isRecord(value) || typeof value.provider !== "string" || typeof value.model !== "string") {
    throw permanent("Stored model decision is invalid.");
  }
  const message = value.message;
  if (!isFinishReason(value.finish) || (message !== null && typeof message !== "string")) {
    throw permanent("Stored model decision is invalid.");
  }
  if (!Array.isArray(value.calls)) {
    throw permanent("Stored model decision is invalid.");
  }
  const calls: ToolCall[] = [];
  for (const call of value.calls) {
    if (
      !isRecord(call) ||
      typeof call.id !== "string" ||
      typeof call.name !== "string" ||
      !isRecord(call.arguments)
    ) {
      throw permanent("Stored tool call is invalid.");
    }
    const decoded = decodeJson(encodeJson(call.arguments));
    if (!isJsonObject(decoded)) {
      throw permanent("Stored tool call is invalid.");
    }
    calls.push({ id: call.id, name: call.name, arguments: decoded });
  }
  const finish: FinishReason = value.finish;
  const usage = value.usage;
  const timing = value.timingMs;
  return {
    provider: value.provider,
    model: value.model,
    message,
    finish,
    calls,
    ...(isRecord(usage) ? { usage: pickUsage(usage) } : {}),
    ...(isRecord(timing) ? { timingMs: readTiming(timing) } : {}),
  };
}

function pickUsage(value: Record<string, unknown>): ModelUsage {
  return {
    ...(isCount(value.inputTokens) ? { inputTokens: value.inputTokens } : {}),
    ...(isCount(value.outputTokens) ? { outputTokens: value.outputTokens } : {}),
    ...(isCount(value.totalTokens) ? { totalTokens: value.totalTokens } : {}),
  };
}

function readTiming(value: Record<string, unknown>): ModelTiming {
  if (!isCount(value.total)) {
    throw permanent("Stored model timing is invalid.");
  }
  return {
    total: value.total,
    ...(isCount(value.timeToFirstToken) ? { timeToFirstToken: value.timeToFirstToken } : {}),
  };
}

function readToolResult(value: unknown): ToolStepResult {
  if (
    !isRecord(value) ||
    typeof value.ok !== "boolean" ||
    typeof value.name !== "string" ||
    typeof value.callId !== "string" ||
    (value.error !== null && typeof value.error !== "string")
  ) {
    throw permanent("Stored tool result is invalid.");
  }
  const output = value.output === undefined ? null : decodeJson(encodeJson(value.output));
  return {
    ok: value.ok,
    name: value.name,
    callId: value.callId,
    output,
    error: value.error,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function integerAtLeast(value: number | undefined, fallback: number, label: string): number {
  const resolved = value ?? fallback;
  if (!Number.isInteger(resolved) || resolved < 1) {
    throw new LarkxError({
      code: "invalid_workflow_definition",
      message: `${label} must be an integer >= 1.`,
      retryable: false,
    });
  }
  return resolved;
}
