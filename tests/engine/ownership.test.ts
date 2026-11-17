import { createEngine, defineWorkflow } from "@larkx/core";
import { createMemoryStorage } from "@larkx/storage-memory";
import { createAutoClock } from "@larkx/testing";
import { describe, expect, it } from "vitest";

describe("execution ownership", () => {
  it("does not run one workflow twice from concurrent recovery", async () => {
    const calls: string[] = [];
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const workflow = defineWorkflow({
      name: "once",
      version: 1,
      async run(ctx) {
        return ctx.step("only", {
          execution: "local",
          effects: "pure",
          run: async () => {
            calls.push("only");
            await gate;
            return 1;
          },
        });
      },
    });
    const storage = createMemoryStorage();
    const engine = createEngine({
      storage,
      workflows: [workflow],
      clock: createAutoClock(),
      leaseMs: 0,
    });
    const started = await engine.start(workflow, { id: "once-1", input: {} });
    await waitFor(() => calls.length === 1);
    const recovered = await Promise.all([engine.recover(), engine.recover()]);
    expect(recovered).toHaveLength(2);
    expect(calls).toEqual(["only"]);
    release();
    await expect(started.result()).resolves.toBe(1);
    await engine.close();
  });

  it("stops a stale owner from committing over a stolen non-idempotent step", async () => {
    const calls: string[] = [];
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let steal = false;
    const workflow = defineWorkflow({
      name: "charge",
      version: 1,
      async run(ctx) {
        return ctx.step("charge", {
          execution: "local",
          effects: "non-idempotent",
          run: async () => {
            calls.push("charge");
            await gate;
            return "charged";
          },
        });
      },
    });
    const storage = createMemoryStorage({ mayStealFrom: () => steal });
    const first = createEngine({
      storage,
      workflows: [workflow],
      ownerId: "owner-a",
      clock: createAutoClock(),
      leaseMs: 0,
    });
    const run = await first.start(workflow, { id: "charge-1", input: {} });
    await waitFor(() => calls.length === 1);
    steal = true;
    const second = createEngine({
      storage,
      workflows: [workflow],
      ownerId: "owner-b",
      clock: createAutoClock(),
      leaseMs: 0,
    });
    const recovered = await second.resume("charge-1");
    await expect(recovered.result()).rejects.toMatchObject({ code: "unknown_operation_outcome" });
    expect(calls).toEqual(["charge"]);
    release();
    await expect(run.result()).rejects.toMatchObject({ code: "unknown_operation_outcome" });
    expect((await second.getRun("charge-1"))?.status).toBe("BLOCKED");
    expect((await second.getSteps("charge-1"))[0]?.output).toBeNull();
    await second.close();
  });
});

async function waitFor(predicate: () => boolean): Promise<void> {
  const started = Date.now();
  while (!predicate()) {
    if (Date.now() - started > 2_000) {
      throw new Error("timed out waiting for workflow progress");
    }
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}
