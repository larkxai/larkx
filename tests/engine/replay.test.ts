import {
  createEngine,
  defineWorkflow,
  EngineTermination,
  type AnyWorkflow,
  type WorkflowDefinition,
} from "@larkx/core";
import { createMemoryStorage } from "@larkx/storage-memory";
import { createAutoClock } from "@larkx/testing";
import { describe, expect, it } from "vitest";

function letters(
  calls: string[],
): WorkflowDefinition<{ text: string }, { total: number; operationId: string }> {
  return defineWorkflow({
    name: "count-letters",
    version: 1,
    async run(ctx, input) {
      const normalized = await ctx.step("normalize", {
        execution: "local",
        effects: "pure",
        run: () => {
          calls.push("normalize");
          return input.text.trim().toLowerCase();
        },
      });
      const total = await ctx.step("count", {
        execution: "local",
        effects: "pure",
        run: () => {
          calls.push("count");
          return normalized.length;
        },
      });
      return ctx.step("summarize", {
        execution: "local",
        effects: "idempotent",
        run: ({ operationId }) => {
          calls.push("summarize");
          return { operationId, total };
        },
      });
    },
  });
}

function engineFor(
  workflow: AnyWorkflow,
  storage = createMemoryStorage(),
  hooks?: {
    afterStepCommit?: (info: { stepKey: string }) => void;
    beforeStepCommit?: (info: { stepKey: string }) => void;
  },
) {
  return createEngine({
    storage,
    workflows: [workflow],
    clock: createAutoClock(),
    leaseMs: 0,
    ...(hooks ? { hooks } : {}),
  });
}

describe("local replay", () => {
  it("completes a workflow and does not repeat handlers for an existing run", async () => {
    const calls: string[] = [];
    const workflow = letters(calls);
    const storage = createMemoryStorage();
    const engine = engineFor(workflow, storage);
    const first = await engine.start(workflow, { id: "letters-1", input: { text: " AbC " } });
    await expect(first.result()).resolves.toMatchObject({ total: 3 });
    expect(calls).toEqual(["normalize", "count", "summarize"]);

    const second = engineFor(workflow, storage);
    const again = await second.start(workflow, { id: "letters-1", input: { text: " AbC " } });
    await expect(again.result()).resolves.toMatchObject({ total: 3 });
    expect(calls).toEqual(["normalize", "count", "summarize"]);
    const history = await second.getHistory("letters-1");
    expect(JSON.stringify(history.map((event) => event.payload))).not.toContain("AbC");
    expect(collectStrings(history)).not.toContain("abc");
    const steps = await second.getSteps("letters-1");
    expect(steps.map((step) => step.stepKey)).toEqual(["normalize", "count", "summarize"]);
    expect(steps[0]?.output).toBe("abc");
    await second.close();
  });

  it("resumes after a committed step without repeating it", async () => {
    const calls: string[] = [];
    const workflow = letters(calls);
    const storage = createMemoryStorage();
    const engine = engineFor(workflow, storage, {
      afterStepCommit(info) {
        if (info.stepKey === "normalize") {
          throw new EngineTermination();
        }
      },
    });
    const run = await engine.start(workflow, { id: "letters-2", input: { text: "ab" } });
    await expect(run.result()).rejects.toMatchObject({ code: "execution_ownership_conflict" });
    expect(calls).toEqual(["normalize"]);

    const recovered = engineFor(workflow, storage);
    const handle = await recovered.resume("letters-2");
    await expect(handle.result()).resolves.toMatchObject({ total: 2 });
    expect(calls).toEqual(["normalize", "count", "summarize"]);
    await recovered.close();
  });

  it("retries an interrupted pure step and reuses an idempotent operation id", async () => {
    const calls: string[] = [];
    const seen = new Set<string>();
    const workflow = defineWorkflow({
      name: "retry-pure",
      version: 1,
      async run(ctx, input: { value: number }) {
        const first = await ctx.step("first", {
          execution: "local",
          effects: "pure",
          run: () => {
            calls.push("first");
            if (calls.filter((call) => call === "first").length === 1) {
              throw new EngineTermination();
            }
            return input.value + 1;
          },
        });
        return ctx.step("save", {
          execution: "local",
          effects: "idempotent",
          run: ({ operationId }) => {
            seen.add(operationId);
            calls.push("save");
            if (calls.filter((call) => call === "save").length === 1) {
              throw new EngineTermination();
            }
            return { operationId, first };
          },
        });
      },
    });
    const storage = createMemoryStorage();
    const firstEngine = engineFor(workflow, storage);
    await expect(
      (await firstEngine.start(workflow, { id: "retry-1", input: { value: 1 } })).result(),
    ).rejects.toBeInstanceOf(Error);
    const second = engineFor(workflow, storage);
    await expect((await second.resume("retry-1")).result()).rejects.toBeInstanceOf(Error);
    const third = engineFor(workflow, storage);
    const output = await (await third.resume("retry-1")).result();
    expect(output).toMatchObject({ first: 2 });
    expect(seen.size).toBe(1);
    expect(calls.filter((call) => call === "first")).toHaveLength(2);
    expect(calls.filter((call) => call === "save")).toHaveLength(2);
    await third.close();
  });

  it("blocks an interrupted non-idempotent step until reconcile", async () => {
    const calls: string[] = [];
    let operationId = "";
    const workflow = defineWorkflow({
      name: "charge",
      version: 1,
      async run(ctx) {
        return ctx.step("charge", {
          execution: "local",
          effects: "non-idempotent",
          run: ({ operationId: id }) => {
            calls.push("charge");
            operationId = id;
            if (calls.length === 1) {
              throw new EngineTermination();
            }
            return { operationId: id };
          },
        });
      },
    });
    const storage = createMemoryStorage();
    const engine = engineFor(workflow, storage);
    await expect(
      (await engine.start(workflow, { id: "charge-1", input: {} })).result(),
    ).rejects.toBeInstanceOf(Error);
    expect(calls).toEqual(["charge"]);
    const recovered = engineFor(workflow, storage);
    await expect((await recovered.resume("charge-1")).result()).rejects.toMatchObject({
      code: "unknown_operation_outcome",
    });
    expect(calls).toEqual(["charge"]);
    await recovered.reconcileStep("charge-1", "charge", { resolution: "retry" });
    const retried = await (await recovered.resume("charge-1")).result();
    expect(calls).toEqual(["charge", "charge"]);
    expect(retried).toMatchObject({ operationId });
    await recovered.close();
  });

  it("detects an incompatible step identity and an unavailable workflow version", async () => {
    const calls: string[] = [];
    const original = defineWorkflow({
      name: "branch",
      version: 1,
      async run(ctx) {
        await ctx.step("a", {
          execution: "local",
          effects: "pure",
          run: () => {
            calls.push("a");
            return 1;
          },
        });
        return ctx.step("b", {
          execution: "local",
          effects: "pure",
          run: () => {
            calls.push("b");
            return 2;
          },
        });
      },
    });
    const storage = createMemoryStorage();
    const engine = engineFor(original, storage, {
      afterStepCommit(info) {
        if (info.stepKey === "a") {
          throw new EngineTermination();
        }
      },
    });
    await expect(
      (await engine.start(original, { id: "branch-1", input: {} })).result(),
    ).rejects.toBeInstanceOf(Error);

    const diverged = defineWorkflow({
      name: "branch",
      version: 1,
      async run(ctx) {
        return ctx.step("c", {
          execution: "local",
          effects: "pure",
          run: () => {
            calls.push("c");
            return 3;
          },
        });
      },
    });
    const replay = createEngine({
      storage,
      workflows: [diverged],
      clock: createAutoClock(),
      leaseMs: 0,
    });
    await expect((await replay.resume("branch-1")).result()).rejects.toMatchObject({
      code: "replay_divergence",
    });
    expect(calls).toEqual(["a"]);
    await replay.close();
  });
});

function collectStrings(value: unknown): string[] {
  if (typeof value === "string") {
    return [value];
  }
  if (Array.isArray(value)) {
    return value.flatMap((item) => collectStrings(item));
  }
  if (typeof value === "object" && value !== null) {
    return Object.values(value).flatMap((item) => collectStrings(item));
  }
  return [];
}
