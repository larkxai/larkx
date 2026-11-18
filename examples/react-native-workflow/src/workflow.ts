import { defineWorkflow, type WorkflowDefinition } from "@larkx/core";

export interface NotesInput {
  readonly text: string;
}

export interface NotesOutput {
  readonly operationId: string;
  readonly total: number;
  readonly normalized: string;
}

interface DemoGlobals {
  __larkxDemoWorkflows?: {
    notes: WorkflowDefinition<NotesInput, NotesOutput>;
    charge: WorkflowDefinition<Record<string, never>, { operationId: string }>;
  };
  __larkxDemoCalls?: string[];
}

function globals(): DemoGlobals {
  return globalThis as DemoGlobals;
}

export function sessionCalls(): string[] {
  const holder = globals();
  if (!holder.__larkxDemoCalls) {
    holder.__larkxDemoCalls = [];
  }
  return holder.__larkxDemoCalls;
}

export function clearSessionCalls(): void {
  sessionCalls().length = 0;
}

function trace(stepKey: string): void {
  sessionCalls().push(stepKey);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function createWorkflows(): NonNullable<DemoGlobals["__larkxDemoWorkflows"]> {
  const notes = defineWorkflow({
    name: "mobile-notes",
    version: 1,
    async run(ctx, input: NotesInput): Promise<NotesOutput> {
      const normalized = await ctx.step("intake", {
        execution: "local",
        effects: "pure",
        run: async () => {
          trace("intake");
          await delay(700);
          return input.text.trim().toLowerCase();
        },
      });
      const total = await ctx.step("count", {
        execution: "local",
        effects: "pure",
        run: async () => {
          trace("count");
          await delay(700);
          return normalized.length;
        },
      });
      await ctx.step("pause", {
        execution: "local",
        effects: "pure",
        run: async () => {
          trace("pause");
          await delay(4_000);
          return "paused";
        },
      });
      return ctx.step("record", {
        execution: "local",
        effects: "idempotent",
        run: async ({ operationId }) => {
          trace("record");
          await delay(700);
          return { operationId, total, normalized };
        },
      });
    },
  });
  const charge = defineWorkflow({
    name: "mobile-charge",
    version: 1,
    async run(ctx, _input: Record<string, never>) {
      return ctx.step("charge", {
        execution: "local",
        effects: "non-idempotent",
        run: async ({ operationId }) => {
          trace("charge");
          await delay(3_000);
          return { operationId };
        },
      });
    },
  });
  return { notes, charge };
}

/** Stable workflow objects for this JavaScript realm. A full reload creates new ones. */
export function demoWorkflows(): NonNullable<DemoGlobals["__larkxDemoWorkflows"]> {
  const holder = globals();
  if (!holder.__larkxDemoWorkflows) {
    holder.__larkxDemoWorkflows = createWorkflows();
  }
  return holder.__larkxDemoWorkflows;
}
