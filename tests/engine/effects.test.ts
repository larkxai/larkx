import {
  createEngine,
  defineWorkflow,
  EngineTermination,
  LarkxError,
  type AnyWorkflow,
} from "@larkxai/core";
import { PROTOCOL_VERSION } from "@larkxai/protocol";
import { createMemoryStorage } from "@larkxai/storage-memory";
import { createAutoClock } from "@larkxai/testing";
import { describe, expect, it } from "vitest";

function testEngine(
  workflow: AnyWorkflow,
  storage = createMemoryStorage(),
  dataPolicy: "device-only" | "cloud-allowed" = "device-only",
) {
  return createEngine({
    storage,
    workflows: [workflow],
    clock: createAutoClock(),
    leaseMs: 0,
    dataPolicy,
  });
}

describe("effect policy", () => {
  it("retries a thrown pure step and then succeeds", async () => {
    let attempts = 0;
    const workflow = defineWorkflow({
      name: "flaky",
      version: 1,
      async run(ctx) {
        return ctx.step("work", {
          execution: "local",
          effects: "pure",
          retry: { maxAttempts: 3, initialIntervalMs: 5, maxIntervalMs: 5, backoff: "fixed" },
          run: () => {
            attempts += 1;
            if (attempts < 3) {
              throw new Error("temporary");
            }
            return "ok";
          },
        });
      },
    });
    const engine = testEngine(workflow);
    await expect(
      (await engine.start(workflow, { id: "flaky-1", input: {} })).result(),
    ).resolves.toBe("ok");
    expect(attempts).toBe(3);
    await engine.close();
  });

  it("does not retry a permanent pure failure", async () => {
    let attempts = 0;
    const workflow = defineWorkflow({
      name: "permanent",
      version: 1,
      async run(ctx) {
        return ctx.step("work", {
          execution: "local",
          effects: "pure",
          run: () => {
            attempts += 1;
            throw new LarkxError({
              code: "permanent_execution_failure",
              message: "bad input",
              retryable: false,
            });
          },
        });
      },
    });
    const engine = testEngine(workflow);
    await expect(
      (await engine.start(workflow, { id: "perm-1", input: {} })).result(),
    ).rejects.toMatchObject({
      code: "permanent_execution_failure",
    });
    expect(attempts).toBe(1);
    expect((await engine.getRun("perm-1"))?.status).toBe("FAILED");
    await engine.close();
  });

  it("blocks a non-idempotent handler failure instead of retrying it", async () => {
    let attempts = 0;
    const workflow = defineWorkflow({
      name: "send",
      version: 1,
      async run(ctx) {
        return ctx.step("send", {
          execution: "local",
          effects: "non-idempotent",
          retry: { maxAttempts: 5, initialIntervalMs: 1, maxIntervalMs: 1, backoff: "fixed" },
          run: () => {
            attempts += 1;
            throw new Error("smtp accepted then socket died");
          },
        });
      },
    });
    const storage = createMemoryStorage();
    const engine = testEngine(workflow, storage);
    await expect(
      (await engine.start(workflow, { id: "send-1", input: {} })).result(),
    ).rejects.toMatchObject({
      code: "unknown_operation_outcome",
    });
    expect(attempts).toBe(1);
    const recovered = testEngine(workflow, storage);
    await expect((await recovered.resume("send-1")).result()).rejects.toMatchObject({
      code: "unknown_operation_outcome",
    });
    expect(attempts).toBe(1);
    await recovered.close();
  });

  it("rejects cloud transfer under the default device-only policy", async () => {
    let localCalls = 0;
    const workflow = defineWorkflow({
      name: "hybrid-plan",
      version: 1,
      async run(ctx) {
        await ctx.step("remote", {
          execution: "cloud",
          effects: "pure",
          handler: "generate-plan-v1",
          input: { secret: "do-not-send" },
        });
        return ctx.step("hybrid", {
          execution: "hybrid",
          effects: "pure",
          input: { secret: "do-not-send" },
          cloud: "generate-plan-v1",
          local: () => {
            localCalls += 1;
            return "local";
          },
        });
      },
    });
    const engine = testEngine(workflow);
    await expect(
      (await engine.start(workflow, { id: "policy-1", input: {} })).result(),
    ).rejects.toMatchObject({
      code: "permission_denied",
    });
    expect(localCalls).toBe(0);
    await engine.close();
  });

  it("reports cloud steps as unsupported when cloud is explicitly allowed", async () => {
    const workflow = defineWorkflow({
      name: "cloud-plan",
      version: 1,
      dataPolicy: "cloud-allowed",
      async run(ctx) {
        return ctx.step("remote", {
          execution: "cloud",
          effects: "pure",
          handler: "generate-plan-v1",
          input: { n: 1 },
        });
      },
    });
    const engine = testEngine(workflow, createMemoryStorage(), "cloud-allowed");
    await expect(
      (await engine.start(workflow, { id: "cloud-1", input: {} })).result(),
    ).rejects.toMatchObject({
      code: "unsupported_capability",
    });
    expect(engine.capabilities.remoteDispatch).toBe(false);
    expect(engine.capabilities.executionTargets).toEqual(["local"]);
    await engine.close();
  });

  it("replays a durable clock value instead of reading the clock again", async () => {
    let attempts = 0;
    const workflow = defineWorkflow({
      name: "clocked",
      version: 1,
      async run(ctx) {
        const stamp = await ctx.now("started-at");
        return ctx.step("check", {
          execution: "local",
          effects: "pure",
          run: () => {
            attempts += 1;
            if (attempts === 1) {
              throw new EngineTermination();
            }
            return stamp;
          },
        });
      },
    });
    const storage = createMemoryStorage();
    const engine = createEngine({
      storage,
      workflows: [workflow],
      clock: createAutoClock(1_000),
      leaseMs: 0,
    });
    await expect(
      (await engine.start(workflow, { id: "clock-1", input: {} })).result(),
    ).rejects.toBeInstanceOf(Error);
    const recovered = createEngine({
      storage,
      workflows: [workflow],
      clock: createAutoClock(5_000),
      leaseMs: 0,
    });
    await expect((await recovered.resume("clock-1")).result()).resolves.toBe(1_000);
    await recovered.close();
  });

  it("blocks unknown workflow versions and protocol mismatches", async () => {
    const storage = createMemoryStorage();
    await storage.createRun({
      runId: "old-version",
      workflowName: "missing-workflow",
      workflowVersion: 4,
      inputJson: "{}",
      nowMs: 1,
      eventId: "e1",
      protocolVersion: PROTOCOL_VERSION,
      dataPolicy: "device-only",
    });
    await storage.createRun({
      runId: "old-protocol",
      workflowName: "missing-workflow",
      workflowVersion: 1,
      inputJson: "{}",
      nowMs: 1,
      eventId: "e2",
      protocolVersion: 99,
      dataPolicy: "device-only",
    });
    const present = defineWorkflow({
      name: "missing-workflow",
      version: 1,
      async run() {
        return "nope";
      },
    });
    const engine = createEngine({
      storage,
      workflows: [present],
      clock: createAutoClock(),
      leaseMs: 0,
    });
    await expect((await engine.resume("old-version")).result()).rejects.toMatchObject({
      code: "unknown_workflow_version",
    });
    await expect((await engine.resume("old-protocol")).result()).rejects.toMatchObject({
      code: "protocol_incompatible",
    });
    await engine.close();
  });

  it("rejects a second start that changes input", async () => {
    const workflow = defineWorkflow({
      name: "echo",
      version: 1,
      async run(_ctx, input: { value: number }) {
        return input.value;
      },
    });
    const engine = testEngine(workflow);
    await (await engine.start(workflow, { id: "echo-1", input: { value: 1 } })).result();
    await expect(
      engine.start(workflow, { id: "echo-1", input: { value: 2 } }),
    ).rejects.toMatchObject({
      code: "incompatible_run",
    });
    await engine.close();
  });

  it("cancels cooperatively before the next step", async () => {
    let release: (value: string) => void = () => {};
    const calls: string[] = [];
    const workflow = defineWorkflow({
      name: "cancel-me",
      version: 1,
      async run(ctx) {
        await ctx.step("first", {
          execution: "local",
          effects: "pure",
          run: () => {
            calls.push("first");
            return 1;
          },
        });
        await ctx.step("second", {
          execution: "local",
          effects: "pure",
          run: (step) =>
            new Promise<string>((resolve) => {
              step.signal.addEventListener("abort", () => resolve("aborted"));
              calls.push("second");
              release = resolve;
            }),
        });
        return ctx.step("third", {
          execution: "local",
          effects: "pure",
          run: () => {
            calls.push("third");
            return 3;
          },
        });
      },
    });
    const engine = testEngine(workflow);
    const handle = await engine.start(workflow, { id: "cancel-1", input: {} });
    await waitFor(() => calls.includes("second"));
    await handle.cancel();
    release("late");
    await expect(handle.result()).rejects.toMatchObject({ code: "cancelled_execution" });
    expect(calls).toEqual(["first", "second"]);
    expect((await engine.getRun("cancel-1"))?.status).toBe("CANCELLED");
    await engine.close();
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
