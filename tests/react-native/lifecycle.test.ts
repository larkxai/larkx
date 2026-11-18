import { createEngine, defineWorkflow } from "@larkx/core";
import { createMemoryStorage } from "@larkx/storage-memory";
import { createAutoClock } from "@larkx/testing";
import { bindMobileLifecycle, type AppStateSource } from "@larkx/react-native/lifecycle";
import { describe, expect, it } from "vitest";

describe("mobile lifecycle", () => {
  it("recovers on the active transition and ignores background", async () => {
    const calls: string[] = [];
    const workflow = defineWorkflow({
      name: "notes",
      version: 1,
      async run(ctx) {
        return ctx.step("once", {
          execution: "local",
          effects: "pure",
          run: () => {
            calls.push("once");
            return 1;
          },
        });
      },
    });
    const storage = createMemoryStorage({ exclusiveOwnership: true });
    const engine = createEngine({
      storage,
      workflows: [workflow],
      clock: createAutoClock(),
      leaseMs: 0,
    });
    await storage.createRun({
      runId: "notes-1",
      workflowName: "notes",
      workflowVersion: 1,
      inputJson: "{}",
      nowMs: 1,
      eventId: "created",
      protocolVersion: 1,
      dataPolicy: "device-only",
    });
    const appState = fakeAppState("background");
    const seen: Array<boolean | null> = [];
    const lifecycle = bindMobileLifecycle(engine, {
      appState,
      network: {
        async getNetworkState() {
          return { isConnected: false };
        },
      },
      onConnectivity(online) {
        seen.push(online);
      },
    });
    expect(calls).toEqual([]);
    appState.emit("background");
    appState.emit("inactive");
    expect(calls).toEqual([]);
    appState.emit("active");
    await waitFor(() => calls.length === 1);
    appState.emit("active");
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(calls).toEqual(["once"]);
    expect(seen).toContain(false);
    expect((await engine.getRun("notes-1"))?.status).toBe("COMPLETED");
    lifecycle.remove();
    appState.emit("active");
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(calls).toEqual(["once"]);
    await engine.close();
  });

  it("serializes overlapping recover calls", async () => {
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
    const engine = createEngine({
      storage: createMemoryStorage({ exclusiveOwnership: true }),
      workflows: [workflow],
      clock: createAutoClock(),
      leaseMs: 0,
    });
    const started = await engine.start(workflow, { id: "once-1", input: {} });
    await waitFor(() => calls.length === 1);
    await Promise.all([engine.recover(), engine.recover(), engine.recover()]);
    expect(calls).toEqual(["only"]);
    release();
    await expect(started.result()).resolves.toBe(1);
    await engine.close();
  });
});

function fakeAppState(initial: string): AppStateSource & { emit(state: string): void } {
  let currentState = initial;
  const listeners = new Set<(state: string) => void>();
  return {
    get currentState() {
      return currentState;
    },
    addEventListener(_type, listener) {
      listeners.add(listener);
      return {
        remove() {
          listeners.delete(listener);
        },
      };
    },
    emit(state: string) {
      currentState = state;
      for (const listener of listeners) {
        listener(state);
      }
    },
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
