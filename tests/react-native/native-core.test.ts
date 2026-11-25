import { createRequire } from "node:module";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { LarkxError } from "@larkxai/protocol";
import { afterEach, describe, expect, it } from "vitest";

import { createNodeTransport } from "../../packages/react-native/src/native/node-client.js";
import {
  bindNativeAppState,
  createRuntime,
  defineTool,
  scriptedModel,
  sqlite,
  ToolFailure,
  type HostTransport,
  type ModelResponse,
  type Runtime,
} from "../../packages/react-native/src/native/runtime.js";

const notes = defineTool({
  name: "read_notes",
  description: "Read locally stored notes",
  schema: { type: "object", properties: {} },
  effects: "pure",
  handler: () => ({ notes: ["Example note"] }),
});

const toolCall: ModelResponse = {
  message: null,
  finish: "tool_calls",
  calls: [{ id: "call-1", name: "read_notes", arguments: {} }],
};

const summary: ModelResponse = {
  message: "Summary: Example note",
  finish: "stop",
  calls: [],
};

const openRuntimes: Runtime[] = [];
const directories: string[] = [];

afterEach(async () => {
  const closing = openRuntimes.splice(0);
  await Promise.all(closing.map((runtime) => runtime.close()));
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("native React Native host", () => {
  it("reports the C++ core and closes the runtime", async () => {
    const { runtime } = await openHost();
    expect(runtime.versions).toMatchObject({
      backend: "native-cpp",
      abi: 2,
      protocol: 1,
      schema: 1,
    });
    await runtime.close();
    await expect(runtime.resume("missing")).rejects.toMatchObject({
      code: "invalid_state_transition",
    });
  });

  it("runs a multi-turn agent and keeps committed work after reopen", async () => {
    const directory = tempDirectory();
    const path = join(directory, "agent.db");
    const firstModel = scriptedModel([toolCall, summary]);
    let toolCalls = 0;
    const tool = defineTool({
      name: "read_notes",
      description: "Read locally stored notes",
      schema: { type: "object", properties: {} },
      effects: "pure",
      handler: () => {
        toolCalls += 1;
        return { notes: ["Example note"] };
      },
    });
    const first = await openHost(path);
    const agent = first.runtime.createAgent({
      name: "personal-assistant",
      version: 1,
      model: firstModel,
      instructions: "Help the user manage daily tasks.",
      tools: [tool],
    });
    const run = await agent.start({ message: "Summarize my notes", runId: "assistant-1" });
    const pending = run.result();
    const again = run.result();
    const result = await pending;
    expect(await again).toEqual(result);
    expect(result).toEqual({
      message: "Summary: Example note",
      finish: "stop",
      iterations: 2,
      toolCalls: 1,
    });
    expect(firstModel.invocations).toBe(2);
    expect(toolCalls).toBe(1);
    const history = await run.getHistory();
    const modelSteps = history.steps.filter((step) => step.stepKey.startsWith("model-"));
    const toolSteps = history.steps.filter((step) => step.stepKey.startsWith("tool-"));
    expect(modelSteps.map((step) => step.status)).toEqual(["COMPLETED", "COMPLETED"]);
    expect(toolSteps).toHaveLength(1);
    expect(toolSteps[0]?.output).toMatchObject({ ok: true, name: "read_notes" });
    const operationIds = history.steps.map((step) => step.operationId);
    expect(new Set(operationIds).size).toBe(operationIds.length);
    expect(history.events.length).toBeGreaterThan(0);
    await first.runtime.close();

    const recoveredModel = scriptedModel([]);
    let recoveredTools = 0;
    const second = await openHost(path);
    second.runtime.createAgent({
      name: "personal-assistant",
      version: 1,
      model: recoveredModel,
      instructions: "Help the user manage daily tasks.",
      tools: [
        defineTool({
          name: "read_notes",
          description: "Read locally stored notes",
          schema: { type: "object", properties: {} },
          effects: "pure",
          handler: () => {
            recoveredTools += 1;
            return { notes: ["Example note"] };
          },
        }),
      ],
    });
    const recovered = await second.runtime.resume("assistant-1");
    expect(await recovered.getStatus()).toMatchObject({
      status: "COMPLETED",
      runId: "assistant-1",
    });
    expect(await recovered.result()).toEqual(result);
    expect(recoveredModel.invocations).toBe(0);
    expect(recoveredTools).toBe(0);
    const replayed = await recovered.getHistory();
    expect(replayed.steps.map((step) => step.operationId)).toEqual(operationIds);
  });

  it("rejects a second registration, an unknown run, and a bad agent name", async () => {
    const { runtime } = await openHost();
    const model = scriptedModel([summary]);
    runtime.createAgent({
      name: "personal-assistant",
      version: 1,
      model,
      instructions: "Help the user.",
      tools: [notes],
    });
    expect(() =>
      runtime.createAgent({
        name: "personal-assistant",
        version: 1,
        model,
        instructions: "Help the user.",
        tools: [notes],
      }),
    ).toThrow(LarkxError);
    expect(() =>
      runtime.createAgent({
        name: "Bad Name",
        version: 1,
        model,
        instructions: "Help the user.",
      }),
    ).toThrow(/Agent name/);
    await expect(runtime.resume("missing-run")).rejects.toMatchObject({ code: "run_not_found" });
  });

  it("keeps the operation id across an interrupt and rejects the stale request", async () => {
    const directory = tempDirectory();
    const path = join(directory, "agent.db");
    const first = await openHost(path);
    const agent = first.runtime.createAgent({
      name: "personal-assistant",
      version: 1,
      model: scriptedModel([summary]),
      instructions: "Help the user.",
      tools: [],
    });
    await agent.start({ message: "Summarize my notes", runId: "assistant-2" });
    const opened = JSON.parse(
      await first.transport.invoke("drive", { runId: "assistant-2", nowMs: first.now }),
    ) as { requestId: string; operationId: string };
    await first.runtime.close();

    const second = await openHost(path);
    second.runtime.createAgent({
      name: "personal-assistant",
      version: 1,
      model: scriptedModel([summary]),
      instructions: "Help the user.",
      tools: [],
    });
    const replay = JSON.parse(
      await second.transport.invoke("drive", { runId: "assistant-2", nowMs: second.now }),
    ) as { requestId: string; operationId: string };
    expect(replay.operationId).toBe(opened.operationId);
    expect(replay.requestId).not.toBe(opened.requestId);
    expect(() =>
      second.transport.invoke("submitModel", {
        runId: "assistant-2",
        requestId: opened.requestId,
        bodyJson: JSON.stringify(summary),
        errorCode: "",
        errorMessage: "",
        retryable: false,
        nowMs: second.now,
      }),
    ).toThrow(/Stale or duplicate/);
  });

  it("rejects a duplicate model result", async () => {
    const { runtime, transport, now } = await openHost();
    const agent = runtime.createAgent({
      name: "personal-assistant",
      version: 1,
      model: scriptedModel([summary]),
      instructions: "Help the user.",
    });
    await agent.start({ message: "Summarize my notes", runId: "assistant-3" });
    const request = JSON.parse(
      await transport.invoke("drive", { runId: "assistant-3", nowMs: now }),
    ) as { requestId: string };
    const submit = {
      runId: "assistant-3",
      requestId: request.requestId,
      bodyJson: JSON.stringify(summary),
      errorCode: "",
      errorMessage: "",
      retryable: false,
      nowMs: now,
    };
    await transport.invoke("submitModel", submit);
    expect(() => transport.invoke("submitModel", submit)).toThrow(/Stale or duplicate/);
  });

  it("does not run a second host handler while a request is in flight", async () => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let entered = 0;
    const drives: string[] = [];
    const inner = createNodeTransport();
    const { runtime, now } = await openHost(undefined, {
      invoke(method, args) {
        const text = inner.invoke(method, args);
        if (method === "drive" && typeof text === "string") {
          drives.push(text);
        }
        return text;
      },
    });
    const agent = runtime.createAgent({
      name: "personal-assistant",
      version: 1,
      model: {
        id: "scripted",
        model: "scripted-1",
        async complete() {
          entered += 1;
          await gate;
          return summary;
        },
      },
      instructions: "Help the user.",
    });
    const run = await agent.start({ message: "Summarize my notes", runId: "assistant-4" });
    const pending = run.result();
    await waitFor(() => entered === 1 && drives.length === 1);
    const second = JSON.parse(
      await inner.invoke("drive", { runId: "assistant-4", nowMs: now }),
    ) as { requestId: string };
    const first = JSON.parse(drives[0] ?? "{}") as { requestId: string };
    expect(second.requestId).toBe(first.requestId);
    expect(entered).toBe(1);
    release();
    await pending;
    expect(entered).toBe(1);
  });

  it("cancels an in-flight model call", async () => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const { runtime } = await openHost();
    const agent = runtime.createAgent({
      name: "personal-assistant",
      version: 1,
      model: {
        id: "scripted",
        model: "scripted-1",
        async complete(_request, context) {
          await gate;
          if (context.signal.aborted) {
            throw new DOMException("The model was aborted.", "AbortError");
          }
          return summary;
        },
      },
      instructions: "Help the user.",
    });
    const run = await agent.start({ message: "Summarize my notes", runId: "assistant-5" });
    const pending = run.result();
    await run.cancel();
    release();
    await expect(pending).rejects.toMatchObject({ code: "cancelled_execution" });
    expect((await run.getStatus()).status).toBe("CANCELLED");
  });

  it("pauses before the next host request and resumes", async () => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let calls = 0;
    const { runtime } = await openHost();
    const agent = runtime.createAgent({
      name: "personal-assistant",
      version: 1,
      model: {
        id: "scripted",
        model: "scripted-1",
        async complete() {
          calls += 1;
          if (calls === 1) {
            await gate;
            return toolCall;
          }
          return summary;
        },
      },
      instructions: "Help the user.",
      tools: [notes],
    });
    const run = await agent.start({ message: "Summarize my notes", runId: "assistant-6" });
    const pending = run.result();
    await waitFor(() => calls === 1);
    await run.pause();
    release();
    await waitFor(async () => (await run.getStatus()).status === "WAITING");
    expect(calls).toBe(1);
    await run.resume();
    expect(await pending).toMatchObject({ message: "Summary: Example note", toolCalls: 1 });
    expect(calls).toBe(2);
  });

  it("blocks an interrupted non-idempotent tool until reconcile", async () => {
    const directory = tempDirectory();
    const path = join(directory, "agent.db");
    let releaseTool: () => void = () => undefined;
    const toolGate = new Promise<void>((resolve) => {
      releaseTool = resolve;
    });
    const first = await openHost(path);
    const agent = first.runtime.createAgent({
      name: "personal-assistant",
      version: 1,
      model: scriptedModel([toolCall, summary]),
      instructions: "Help the user.",
      tools: [
        defineTool({
          name: "read_notes",
          description: "Read locally stored notes",
          schema: { type: "object", properties: {} },
          effects: "non-idempotent",
          handler: async () => {
            await toolGate;
            return { notes: ["Example note"] };
          },
        }),
      ],
    });
    const run = await agent.start({ message: "Summarize my notes", runId: "assistant-7" });
    const pending = run.result();
    await waitFor(async () => {
      const history = await run.getHistory();
      return history.steps.some(
        (step) => step.stepKey.startsWith("tool-") && step.status === "RUNNING",
      );
    });
    await first.runtime.close();
    releaseTool();
    await expect(pending).rejects.toMatchObject({ code: "invalid_state_transition" });

    let repeated = 0;
    const second = await openHost(path);
    second.runtime.createAgent({
      name: "personal-assistant",
      version: 1,
      model: scriptedModel([summary]),
      instructions: "Help the user.",
      tools: [
        defineTool({
          name: "read_notes",
          description: "Read locally stored notes",
          schema: { type: "object", properties: {} },
          effects: "non-idempotent",
          handler: () => {
            repeated += 1;
            return { notes: ["Example note"] };
          },
        }),
      ],
    });
    const recovered = await second.runtime.resume("assistant-7");
    const resultPromise = recovered.result();
    await waitFor(async () => (await recovered.getStatus()).status === "BLOCKED");
    await recovered.reconcile({
      resolution: "complete",
      output: { notes: ["Example note"] },
      message: "The charge did not happen.",
    });
    expect(await resultPromise).toMatchObject({ message: "Summary: Example note" });
    expect(repeated).toBe(0);
  });

  it("retries a tool once and keeps the operation id", async () => {
    let attempts = 0;
    const seen: string[] = [];
    const { runtime } = await openHost();
    const agent = runtime.createAgent({
      name: "personal-assistant",
      version: 1,
      model: scriptedModel([toolCall, summary]),
      instructions: "Help the user.",
      tools: [
        defineTool({
          name: "read_notes",
          description: "Read locally stored notes",
          schema: { type: "object", properties: {} },
          effects: "idempotent",
          handler: (_input, context) => {
            attempts += 1;
            seen.push(context.operationId);
            if (attempts === 1) {
              throw new ToolFailure("temporary", { retryable: true });
            }
            return { notes: ["Example note"] };
          },
        }),
      ],
    });
    const run = await agent.start({ message: "Summarize my notes", runId: "assistant-8" });
    expect(await run.result()).toMatchObject({ toolCalls: 1 });
    expect(attempts).toBe(2);
    expect(seen[0]).toBe(seen[1]);
  });

  it("does not call a handler for an unknown tool", async () => {
    let tools = 0;
    const { runtime } = await openHost();
    const model = scriptedModel([
      {
        message: null,
        finish: "tool_calls",
        calls: [{ id: "call-x", name: "missing_tool", arguments: {} }],
      },
      summary,
    ]);
    const agent = runtime.createAgent({
      name: "personal-assistant",
      version: 1,
      model,
      instructions: "Help the user.",
      tools: [
        defineTool({
          name: "read_notes",
          description: "Read locally stored notes",
          schema: { type: "object", properties: {} },
          effects: "pure",
          handler: () => {
            tools += 1;
            return { notes: ["Example note"] };
          },
        }),
      ],
    });
    const run = await agent.start({ message: "Summarize my notes", runId: "assistant-9" });
    await run.result();
    expect(tools).toBe(0);
    expect(model.invocations).toBe(2);
  });

  it("waits to start host work while the app is in the background", async () => {
    let listener: (state: string) => void = () => undefined;
    const { runtime } = await openHost();
    bindNativeAppState(runtime, {
      currentState: "background",
      addEventListener(_type, next) {
        listener = next;
        return { remove() {} };
      },
    });
    const model = scriptedModel([summary]);
    const agent = runtime.createAgent({
      name: "personal-assistant",
      version: 1,
      model,
      instructions: "Help the user.",
    });
    const run = await agent.start({ message: "Summarize my notes", runId: "assistant-10" });
    const pending = run.result();
    await delay(40);
    expect(model.invocations).toBe(0);
    listener("active");
    expect(await pending).toMatchObject({ message: "Summary: Example note" });
    expect(model.invocations).toBe(1);
  });

  it("schedules execution from start before result is awaited", async () => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let calls = 0;
    const { runtime } = await openHost();
    const agent = runtime.createAgent({
      name: "personal-assistant",
      version: 1,
      model: {
        id: "scripted",
        model: "scripted-1",
        async complete() {
          calls += 1;
          await gate;
          return summary;
        },
      },
      instructions: "Help the user.",
    });
    const run = await agent.start({ message: "Summarize my notes", runId: "assistant-eager" });
    await waitFor(() => calls === 1);
    const pending = run.result();
    await delay(20);
    expect(calls).toBe(1);
    release();
    expect(await pending).toMatchObject({ message: "Summary: Example note" });
  });

  it("defers execution until schedule()", async () => {
    const { runtime } = await openHost();
    const model = scriptedModel([summary]);
    const agent = runtime.createAgent({
      name: "personal-assistant",
      version: 1,
      model,
      instructions: "Help the user.",
    });
    const run = await agent.start({
      message: "Summarize my notes",
      runId: "assistant-deferred",
      defer: true,
    });
    const pending = run.result();
    await delay(40);
    expect(model.invocations).toBe(0);
    expect(await run.getStatus()).toMatchObject({ status: "RUNNING", runId: "assistant-deferred" });
    run.schedule();
    expect(await pending).toMatchObject({ message: "Summary: Example note" });
    expect(model.invocations).toBe(1);
  });

  it("keeps one driver when start and resume race for a run id", async () => {
    let calls = 0;
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const { runtime } = await openHost();
    const agent = runtime.createAgent({
      name: "personal-assistant",
      version: 1,
      model: {
        id: "scripted",
        model: "scripted-1",
        async complete() {
          calls += 1;
          await gate;
          return summary;
        },
      },
      instructions: "Help the user.",
    });
    const starting = Promise.all([
      agent.start({ message: "Summarize my notes", runId: "assistant-shared" }),
      agent.start({ message: "Summarize my notes", runId: "assistant-shared" }),
    ]);
    const [first, second] = await starting;
    expect(second).toBe(first);
    const [resumed, resumedAgain] = await Promise.all([
      runtime.resume("assistant-shared"),
      runtime.resume("assistant-shared"),
    ]);
    expect(resumed).toBe(first);
    expect(resumedAgain).toBe(first);
    const pending = Promise.all([first.result(), second.result(), resumed.result()]);
    await waitFor(() => calls === 1);
    await delay(30);
    expect(calls).toBe(1);
    release();
    await pending;
    expect(calls).toBe(1);
  });

  it("joins the active driver when start and resume overlap a running result", async () => {
    let calls = 0;
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const { runtime } = await openHost();
    const agent = runtime.createAgent({
      name: "personal-assistant",
      version: 1,
      model: {
        id: "scripted",
        model: "scripted-1",
        async complete() {
          calls += 1;
          await gate;
          return summary;
        },
      },
      instructions: "Help the user.",
    });
    const run = await agent.start({ message: "Summarize my notes", runId: "assistant-live" });
    const pending = run.result();
    await waitFor(() => calls === 1);
    const [again, resumed] = await Promise.all([
      agent.start({ message: "Summarize my notes", runId: "assistant-live" }),
      runtime.resume("assistant-live"),
    ]);
    expect(again).toBe(run);
    expect(resumed).toBe(run);
    const joined = Promise.all([pending, again.result(), resumed.result()]);
    await delay(30);
    expect(calls).toBe(1);
    release();
    await joined;
    expect(calls).toBe(1);
  });

  it("rejects a different message for an attached run without a second driver", async () => {
    const { runtime } = await openHost();
    const model = scriptedModel([summary]);
    const agent = runtime.createAgent({
      name: "personal-assistant",
      version: 1,
      model,
      instructions: "Help the user.",
    });
    const run = await agent.start({ message: "Summarize my notes", runId: "assistant-message" });
    await expect(
      agent.start({ message: "A different message", runId: "assistant-message" }),
    ).rejects.toMatchObject({ code: "invalid_state_transition" });
    expect(await run.result()).toMatchObject({ message: "Summary: Example note" });
    expect(model.invocations).toBe(1);
  });

  it("round-trips multilingual text, emoji, and supplementary characters", async () => {
    const text = "こんにちは Привет مرحبا 你好 😀 𝄞";
    let toolText = "";
    let calls = 0;
    const { runtime } = await openHost();
    const agent = runtime.createAgent({
      name: "personal-assistant",
      version: 1,
      model: {
        id: "scripted",
        model: "scripted-1",
        async complete(request) {
          calls += 1;
          const user = request.messages.find(
            (message) =>
              typeof message === "object" &&
              message !== null &&
              !Array.isArray(message) &&
              message.role === "user",
          );
          const content =
            typeof user === "object" && user !== null && "content" in user ? user.content : "";
          expect(content).toBe(text);
          if (calls === 1) {
            return {
              message: null,
              finish: "tool_calls",
              calls: [{ id: "call-1", name: "read_notes", arguments: { text } }],
            };
          }
          return { message: text, finish: "stop", calls: [] };
        },
      },
      instructions: "Help the user.",
      tools: [
        defineTool({
          name: "read_notes",
          description: "Read locally stored notes",
          schema: {
            type: "object",
            properties: { text: { type: "string" } },
            required: ["text"],
          },
          effects: "pure",
          handler: (input) => {
            toolText =
              typeof input === "object" &&
              input !== null &&
              !Array.isArray(input) &&
              "text" in input
                ? String(input.text)
                : "";
            return { notes: [toolText] };
          },
        }),
      ],
    });
    const run = await agent.start({ message: text, runId: "assistant-unicode" });
    expect(await run.result()).toMatchObject({ message: text, toolCalls: 1 });
    expect(toolText).toBe(text);
    const history = await run.getHistory();
    const stored = JSON.stringify(history.steps);
    expect(stored).toContain("𝄞");
    expect(stored).toContain("😀");
    expect(stored).toContain("こんにちは");
  });

  it("does not let a second owner drive the run", async () => {
    const directory = tempDirectory();
    const path = join(directory, "agent.db");
    const first = await openHost(path, undefined, "owner-a");
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const agent = first.runtime.createAgent({
      name: "personal-assistant",
      version: 1,
      model: {
        id: "scripted",
        model: "scripted-1",
        async complete() {
          await gate;
          return summary;
        },
      },
      instructions: "Help the user.",
    });
    const run = await agent.start({ message: "Summarize my notes", runId: "assistant-11" });
    const pending = run.result();
    await delay(20);
    await first.runtime.close();
    release();
    await expect(pending).rejects.toBeInstanceOf(LarkxError);
    const second = await openHost(path, undefined, "owner-b");
    second.runtime.createAgent({
      name: "personal-assistant",
      version: 1,
      model: scriptedModel([]),
      instructions: "Help the user.",
    });
    const stolen = await second.runtime.resume("assistant-11");
    await expect(stolen.result()).rejects.toMatchObject({ code: "execution_ownership_conflict" });
  });

  it("runs two logical runs without sharing a driver", async () => {
    const { runtime } = await openHost();
    const model = scriptedModel([summary, summary]);
    const agent = runtime.createAgent({
      name: "personal-assistant",
      version: 1,
      model,
      instructions: "Help the user.",
    });
    const [first, second] = await Promise.all([
      agent.start({ message: "Summarize my notes", runId: "assistant-a" }),
      agent.start({ message: "Summarize my notes", runId: "assistant-b" }),
    ]);
    expect(first).not.toBe(second);
    await Promise.all([first.result(), second.result()]);
    expect(model.invocations).toBe(2);
    const listed = await runtime.listRuns();
    expect(listed.map((run) => run.runId).sort()).toEqual(["assistant-a", "assistant-b"]);
  });

  it("discovers a deferred run after the runtime is closed and reopened", async () => {
    const directory = tempDirectory();
    const path = join(directory, "agent.db");
    const first = await openHost(path);
    const agent = first.runtime.createAgent({
      name: "personal-assistant",
      version: 1,
      model: scriptedModel([summary]),
      instructions: "Help the user.",
    });
    await agent.start({ message: "Summarize my notes", runId: "assistant-saved", defer: true });
    await first.runtime.close();
    const second = await openHost(path);
    const listed = await second.runtime.listRuns();
    expect(listed).toEqual([
      expect.objectContaining({
        runId: "assistant-saved",
        status: "RUNNING",
        workflowName: "personal-assistant",
      }),
    ]);
    second.runtime.createAgent({
      name: "personal-assistant",
      version: 1,
      model: scriptedModel([summary]),
      instructions: "Help the user.",
    });
    const recovered = await second.runtime.resume("assistant-saved", { defer: true });
    expect((await recovered.getStatus()).status).toBe("RUNNING");
    recovered.schedule();
    expect(await recovered.result()).toMatchObject({ message: "Summary: Example note" });
  });

  it("waits on an observer before calling the model", async () => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const { runtime } = await openHost();
    runtime.holdExecution(async (event) => {
      if (event.type === "model-requested") {
        await gate;
      }
    });
    const model = scriptedModel([summary]);
    const agent = runtime.createAgent({
      name: "personal-assistant",
      version: 1,
      model,
      instructions: "Help the user.",
    });
    const run = await agent.start({ message: "Summarize my notes", runId: "assistant-boundary" });
    await delay(40);
    expect(model.invocations).toBe(0);
    release();
    expect(await run.result()).toMatchObject({ message: "Summary: Example note" });
    expect(runtime.diagnostics().modelInvocations).toBe(1);
  });

  it("keeps running when a diagnostics observer throws or never settles", async () => {
    const { runtime } = await openHost();
    runtime.observe(() => {
      throw new Error("diagnostics failed");
    });
    runtime.observe(
      () =>
        new Promise<void>(() => {
          // This listener never settles. Diagnostics must not block the driver.
        }),
    );
    const model = scriptedModel([summary]);
    const agent = runtime.createAgent({
      name: "personal-assistant",
      version: 1,
      model,
      instructions: "Help the user.",
    });
    const run = await agent.start({ message: "Summarize my notes", runId: "assistant-observer" });
    expect(await run.result()).toMatchObject({ message: "Summary: Example note" });
    expect(model.invocations).toBe(1);
  });

  it("does not fail the run when a development barrier rejects", async () => {
    const { runtime } = await openHost();
    runtime.holdExecution((event) => {
      if (event.type === "model-requested") {
        throw new Error("barrier failed");
      }
    });
    const model = scriptedModel([summary]);
    const agent = runtime.createAgent({
      name: "personal-assistant",
      version: 1,
      model,
      instructions: "Help the user.",
    });
    const run = await agent.start({ message: "Summarize my notes", runId: "assistant-barrier" });
    expect(await run.result()).toMatchObject({ message: "Summary: Example note" });
  });

  it("refuses to continue a persisted run with a different model", async () => {
    const directory = tempDirectory();
    const path = join(directory, "agent.db");
    let entered: () => void = () => undefined;
    const enteredPromise = new Promise<void>((resolve) => {
      entered = resolve;
    });
    let finishTool: (value: { notes: string[] }) => void = () => undefined;
    const toolPromise = new Promise<{ notes: string[] }>((resolve) => {
      finishTool = resolve;
    });
    const blockingTool = defineTool({
      name: "read_notes",
      description: "Read locally stored notes",
      schema: { type: "object", properties: {} },
      effects: "pure",
      handler: () => {
        entered();
        return toolPromise;
      },
    });
    const first = await openHost(path);
    const original = first.runtime.createAgent({
      name: "field-assistant-local",
      version: 1,
      model: scriptedModel([toolCall], { id: "cactus", model: "qwen3-0.6b-int8" }),
      instructions: "Help the user.",
      tools: [blockingTool],
    });
    const started = await original.start({ message: "Inspect pump 12", runId: "field-local" });
    const ignored = started.result().then(
      () => undefined,
      () => undefined,
    );
    await enteredPromise;
    await first.runtime.close();
    await ignored;

    const mismatch = await openHost(path);
    const wrong = mismatch.runtime.createAgent({
      name: "field-assistant-local",
      version: 1,
      model: scriptedModel([summary], { id: "scripted", model: "scripted-field-inspector" }),
      instructions: "Help the user.",
      tools: [blockingTool],
    });
    await wrong.whenRegistered();
    const rejected = await mismatch.runtime.resume("field-local");
    await expect(rejected.result()).rejects.toThrow(/does not match the committed model/);
    await mismatch.runtime.close();

    finishTool({ notes: ["Seal weeps"] });
    const recovered = await openHost(path);
    const right = recovered.runtime.createAgent({
      name: "field-assistant-local",
      version: 1,
      model: scriptedModel([summary], { id: "cactus", model: "qwen3-0.6b-int8" }),
      instructions: "Help the user.",
      tools: [blockingTool],
    });
    await right.whenRegistered();
    const run = await recovered.runtime.resume("field-local");
    expect(await run.result()).toMatchObject({ message: "Summary: Example note" });
  });

  it("rejects a lone surrogate instead of truncating the prompt", async () => {
    const { runtime } = await openHost();
    const agent = runtime.createAgent({
      name: "personal-assistant",
      version: 1,
      model: scriptedModel([summary]),
      instructions: "Help the user.",
    });
    await expect(
      agent.start({ message: "broken \uD83D", runId: "assistant-surrogate" }),
    ).rejects.toMatchObject({ code: "serialization_failure" });
  });

  it("round-trips an embedded NUL through the node binding", () => {
    const require = createRequire(import.meta.url);
    const addon = require("../../packages/react-native/build/larkx_native.node") as {
      createSession(): { invoke(method: string, argsJson: string): string };
    };
    const payload = "a\0b 😀 𝄞";
    const echoed = JSON.parse(addon.createSession().invoke("echo", payload)) as { text: string };
    expect(echoed.text).toBe(payload);
    expect(echoed.text.length).toBe(payload.length);
  });
});

function tempDirectory(): string {
  const directory = mkdtempSync(join(tmpdir(), "larkx-rn-"));
  directories.push(directory);
  return directory;
}

async function openHost(
  path = join(tempDirectory(), "agent.db"),
  transport: HostTransport = createNodeTransport(),
  ownerId = "larkx-react-native",
): Promise<{ runtime: Runtime; transport: HostTransport; now: number }> {
  let now = 50_000;
  const runtime = await createRuntime({
    storage: sqlite(path),
    transport,
    ownerId,
    now: () => now,
    sleep: async (milliseconds) => {
      now += milliseconds;
    },
  });
  openRuntimes.push(runtime);
  return { runtime, transport, now };
}

async function waitFor(predicate: () => boolean | Promise<boolean>): Promise<void> {
  const started = Date.now();
  while (!(await predicate())) {
    if (Date.now() - started > 2_000) {
      throw new Error("Timed out waiting for the native runtime.");
    }
    await delay(5);
  }
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
