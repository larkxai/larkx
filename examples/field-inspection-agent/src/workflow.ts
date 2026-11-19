import type { ModelAdapter } from "@larkx/agent";
import { defineWorkflow, LarkxError, type RetryPolicy, type WorkflowDefinition } from "@larkx/core";

import {
  CLASSIFY_SYSTEM,
  EXTRACT_SYSTEM,
  firstLine,
  parseActions,
  parseClassified,
  parseIssues,
  PLAN_SYSTEM,
  REPORT_SYSTEM,
  type ClassifyOutput,
  type ExtractOutput,
  type PlanOutput,
  type ReportOutput,
} from "./stages.js";

export interface InspectionInput {
  readonly notes: string;
}

const MODEL_RETRY: RetryPolicy = {
  maxAttempts: 2,
  initialIntervalMs: 10,
  maxIntervalMs: 10,
  backoff: "fixed",
};

export function createInspectionWorkflow(
  model: ModelAdapter,
  options?: { readonly delayMs?: number },
): WorkflowDefinition<InspectionInput, ReportOutput> {
  const delayMs = options?.delayMs ?? 0;
  return defineWorkflow({
    name: "inspection-workflow",
    version: 1,
    dataPolicy: "device-only",
    async run(ctx, input): Promise<ReportOutput> {
      const notes = input.notes.trim();
      if (notes.length === 0) {
        throw permanent("Enter inspection notes before asking for a report.");
      }
      const extracted = await ctx.step("extract", {
        execution: "local",
        effects: "idempotent",
        retry: MODEL_RETRY,
        run: async ({ signal }) => {
          const answer = await ask(model, EXTRACT_SYSTEM, notes, signal);
          const issues = parseIssues(answer.text).map((text) => ({ text }));
          if (issues.length === 0) {
            throw permanent("The extraction stage did not name any issues.");
          }
          const output: ExtractOutput = { issues, model: answer.modelId };
          return output;
        },
      });
      const classified = await ctx.step("classify", {
        execution: "local",
        effects: "idempotent",
        retry: MODEL_RETRY,
        run: async ({ signal }) => {
          const answer = await ask(
            model,
            CLASSIFY_SYSTEM,
            extracted.issues.map((issue) => `- ${issue.text}`).join("\n"),
            signal,
          );
          const issues = parseClassified(answer.text).filter((issue) => issue.text.length > 0);
          if (issues.length === 0) {
            throw permanent("The classification stage did not classify any issues.");
          }
          const output: ClassifyOutput = { issues, model: answer.modelId };
          return output;
        },
      });
      const plan = await ctx.step("plan", {
        execution: "local",
        effects: "idempotent",
        retry: MODEL_RETRY,
        run: async ({ signal }) => {
          if (delayMs > 0) {
            await pause(delayMs, signal);
          }
          const answer = await ask(
            model,
            PLAN_SYSTEM,
            classified.issues.map((issue) => `- ${issue.text} | ${issue.severity}`).join("\n"),
            signal,
          );
          const actions = parseActions(answer.text);
          if (actions.length === 0) {
            throw permanent("The planning stage did not write any actions.");
          }
          const output: PlanOutput = { actions, model: answer.modelId };
          return output;
        },
      });
      return ctx.step("report", {
        execution: "local",
        effects: "idempotent",
        retry: MODEL_RETRY,
        run: async ({ signal }) => {
          const brief = [
            "Issues:",
            ...classified.issues.map((issue) => `- ${issue.text} | ${issue.severity}`),
            "Actions:",
            ...plan.actions.map((action) => `- ${action}`),
          ].join("\n");
          const answer = await ask(model, REPORT_SYSTEM, brief, signal);
          const output: ReportOutput = {
            title: "Building Inspection Report",
            summary: firstLine(answer.text),
            body: answer.text,
            issues: classified.issues,
            actions: plan.actions,
            model: answer.modelId,
          };
          return output;
        },
      });
    },
  });
}

async function ask(
  model: ModelAdapter,
  system: string,
  user: string,
  signal: AbortSignal,
): Promise<{ text: string; modelId: string }> {
  const response = await model.complete(
    {
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      tools: [],
    },
    { signal },
  );
  const text = (response.message ?? "").trim();
  if (text.length === 0 || response.finish === "error") {
    throw permanent("The on-device model returned an empty stage.");
  }
  return { text, modelId: model.model };
}

function permanent(message: string): LarkxError {
  return new LarkxError({
    code: "permanent_execution_failure",
    message,
    retryable: false,
  });
}

function pause(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = (): void => {
      clearTimeout(timer);
      reject(
        new LarkxError({
          code: "cancelled_execution",
          message: "Planning stage cancelled.",
          retryable: false,
        }),
      );
    };
    if (signal.aborted) {
      onAbort();
      return;
    }
    signal.addEventListener("abort", onAbort, { once: true });
  });
}
