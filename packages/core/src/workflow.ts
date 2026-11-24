import {
  LarkxError,
  validateWorkflowName,
  validateWorkflowVersion,
  type DataPolicy,
  type EffectType,
} from "@larkxai/protocol";

import type { RetryPolicy } from "./retry.js";

export interface StepContext {
  readonly operationId: string;
  readonly attempt: number;
  readonly runId: string;
  readonly stepKey: string;
  readonly signal: AbortSignal;
  readonly workflowName: string;
  readonly workflowVersion: number;
}

export interface WorkflowContext {
  readonly runId: string;
  readonly workflowName: string;
  readonly workflowVersion: number;
  readonly signal: AbortSignal;
  step<T>(key: string, options: StepOptions<T>): Promise<T>;
  now(key: string): Promise<number>;
  random(key: string): Promise<number>;
}

export interface LocalStepOptions<T> {
  readonly execution: "local";
  readonly effects: EffectType;
  readonly run: (ctx: StepContext) => Promise<T> | T;
  readonly retry?: RetryPolicy;
  readonly timeoutMs?: number;
}

export interface CloudStepOptions<TInput> {
  readonly execution: "cloud";
  readonly effects: EffectType;
  readonly handler: string;
  readonly handlerVersion?: number;
  readonly input: TInput;
  readonly retry?: RetryPolicy;
  readonly timeoutMs?: number;
}

export interface HybridStepOptions<TInput, TOutput> {
  readonly execution: "hybrid";
  readonly effects: EffectType;
  readonly input: TInput;
  readonly local: (input: TInput, ctx: StepContext) => Promise<TOutput> | TOutput;
  readonly cloud: string;
  readonly cloudVersion?: number;
  readonly retry?: RetryPolicy;
  readonly timeoutMs?: number;
}

export type StepOptions<TOutput> =
  LocalStepOptions<TOutput> | CloudStepOptions<unknown> | HybridStepOptions<unknown, TOutput>;

export interface WorkflowDefinition<TInput, TOutput> {
  readonly name: string;
  readonly version: number;
  readonly dataPolicy?: DataPolicy;
  readonly run: (ctx: WorkflowContext, input: TInput) => Promise<TOutput>;
}

/**
 * Heterogeneous workflow handle. Each definition has its own input and output.
 * An engine registry stores this erased form and `start` restores the caller's types
 * from the definition object they pass.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyWorkflow = WorkflowDefinition<any, any>;

export function defineWorkflow<TInput, TOutput>(
  definition: WorkflowDefinition<TInput, TOutput>,
): WorkflowDefinition<TInput, TOutput> {
  const nameError = validateWorkflowName(definition.name);
  const versionError = validateWorkflowVersion(definition.version);
  if (nameError || versionError) {
    throw new LarkxError({
      code: "invalid_workflow_definition",
      message: nameError ?? versionError ?? "Invalid workflow definition.",
      retryable: false,
    });
  }
  return definition;
}
