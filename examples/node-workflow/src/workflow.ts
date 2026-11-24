import { defineWorkflow } from "@larkxai/core";

export interface LetterInput {
  readonly text: string;
}

export interface LetterOutput {
  readonly operationId: string;
  readonly total: number;
  readonly normalized: string;
}

let tracer: ((stepKey: string) => Promise<void> | void) | undefined;

/** Test and demo hook. Completed steps are not traced again because their handlers do not run. */
export function setStepTracer(next: ((stepKey: string) => Promise<void> | void) | undefined): void {
  tracer = next;
}

async function trace(stepKey: string): Promise<void> {
  await tracer?.(stepKey);
}

export const countLetters = defineWorkflow({
  name: "count-letters",
  version: 1,
  async run(ctx, input: LetterInput): Promise<LetterOutput> {
    const normalized = await ctx.step("normalize", {
      execution: "local",
      effects: "pure",
      run: async () => {
        await trace("normalize");
        return input.text.trim().toLowerCase();
      },
    });
    const total = await ctx.step("count", {
      execution: "local",
      effects: "pure",
      run: async () => {
        await trace("count");
        return normalized.length;
      },
    });
    return ctx.step("summarize", {
      execution: "local",
      effects: "idempotent",
      run: async ({ operationId }) => {
        await trace("summarize");
        return { operationId, total, normalized };
      },
    });
  },
});

export const chargeOnce = defineWorkflow({
  name: "charge-once",
  version: 1,
  async run(ctx, input: { readonly amount: number }) {
    return ctx.step("charge", {
      execution: "local",
      effects: "non-idempotent",
      run: async ({ operationId }) => {
        await trace("charge");
        return { operationId, amount: input.amount, charged: true };
      },
    });
  },
});
