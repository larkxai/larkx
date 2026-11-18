import { createEngine, defineWorkflow } from "@larkx/core";
import { createMemoryStorage } from "@larkx/storage-memory";
import { createFakeClock } from "@larkx/testing";
import { describe, expect, it } from "vitest";

describe("mobile execution ownership", () => {
  it("does not treat an expired lease as a dead owner", async () => {
    const storage = createMemoryStorage({ exclusiveOwnership: true });
    await storage.createRun(run("lease-1"));
    const first = await storage.claimOwnership("lease-1", {
      ownerId: "owner-a",
      nowMs: 0,
      leaseMs: 100,
    });
    const refreshed = await storage.claimOwnership("lease-1", {
      ownerId: "owner-a",
      nowMs: 250,
      leaseMs: 100,
    });
    const other = await storage.claimOwnership("lease-1", {
      ownerId: "owner-b",
      nowMs: 250,
      leaseMs: 100,
    });
    expect(refreshed.acquired).toBe(true);
    expect(refreshed.epoch).toBe(first.epoch);
    expect(other.acquired).toBe(false);
    expect(other.reason).toBe("owned_by_other");
  });

  it("lets a replacement owner take a live lease only when stealing is allowed", async () => {
    const storage = createMemoryStorage({
      exclusiveOwnership: true,
      mayStealFrom: () => true,
    });
    await storage.createRun(run("dead-runtime"));
    const first = await storage.claimOwnership("dead-runtime", {
      ownerId: "owner-a",
      nowMs: 0,
      leaseMs: 60_000,
    });
    const second = await storage.claimOwnership("dead-runtime", {
      ownerId: "owner-b",
      nowMs: 10,
      leaseMs: 60_000,
    });
    expect(second.acquired).toBe(true);
    expect(second.epoch).toBe(first.epoch + 1);
  });

  it("keeps an in-flight handler's fence after the lease expires", async () => {
    const calls: string[] = [];
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const workflow = defineWorkflow({
      name: "hold",
      version: 1,
      async run(ctx) {
        return ctx.step("hold", {
          execution: "local",
          effects: "idempotent",
          run: async ({ operationId }) => {
            calls.push(operationId);
            await gate;
            return { operationId };
          },
        });
      },
    });
    const storage = createMemoryStorage({ exclusiveOwnership: true });
    const clock = createFakeClock(0);
    const first = createEngine({
      storage,
      workflows: [workflow],
      ownerId: "owner-a",
      clock,
      leaseMs: 1_000,
      heartbeat: false,
    });
    const started = await first.start(workflow, { id: "hold-1", input: {} });
    await waitFor(() => calls.length === 1);
    const epoch = (await first.getRun("hold-1"))?.ownershipEpoch;
    clock.advance(5_000);
    const second = createEngine({
      storage,
      workflows: [workflow],
      ownerId: "owner-b",
      clock,
      leaseMs: 1_000,
      heartbeat: false,
    });
    await expect((await second.resume("hold-1")).result()).rejects.toMatchObject({
      code: "execution_ownership_conflict",
    });
    expect(calls).toHaveLength(1);
    expect((await first.getRun("hold-1"))?.ownershipEpoch).toBe(epoch);
    await first.recover();
    expect(calls).toHaveLength(1);
    release();
    await expect(started.result()).resolves.toEqual({ operationId: calls[0] });
    await first.close();
    await second.close();
  });
});

function run(runId: string) {
  return {
    runId,
    workflowName: "hold",
    workflowVersion: 1,
    inputJson: "{}",
    nowMs: 0,
    eventId: `event-${runId}`,
    protocolVersion: 1,
    dataPolicy: "device-only" as const,
  };
}

async function waitFor(predicate: () => boolean): Promise<void> {
  const started = Date.now();
  while (!predicate()) {
    if (Date.now() - started > 2_000) {
      throw new Error("timed out waiting for workflow progress");
    }
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}
