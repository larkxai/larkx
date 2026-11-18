import {
  createAgent,
  createScriptedModel,
  defineTool,
  type JsonSchema,
  type ModelResponse,
  type Tool,
} from "@larkx/agent";
import {
  createEngine,
  EngineTermination,
  LarkxError,
  type Engine,
  type EngineHooks,
  type WorkflowStorage,
} from "@larkx/core";
import type { JsonObject, JsonValue } from "@larkx/protocol";
import { createMemoryStorage } from "@larkx/storage-memory";
import { createAutoClock } from "@larkx/testing";
import { describe, expect, it } from "vitest";

function testEngine(storage: WorkflowStorage = createMemoryStorage(), hooks?: EngineHooks): Engine {
  return createEngine({
    storage,
    workflows: [],
    clock: createAutoClock(),
    leaseMs: 0,
    heartbeat: false,
    ...(hooks !== undefined ? { hooks } : {}),
  });
}

function call(name: string, args: JsonObject = {}): ModelResponse {
  return { message: null, finish: "tool_calls", calls: [{ id: name, name, arguments: args }] };
}

function stop(message: string): ModelResponse {
  return { message, finish: "stop", calls: [] };
}

const lookup = defineTool({
  name: "get_room_info",
  description: "Read the room",
  inputSchema: { type: "object", properties: {}, additionalProperties: false },
  effects: "pure",
  run: () => ({ name: "Living room" }),
});

describe("durable agent loop", () => {
  it("returns a single model response without calling a tool", async () => {
    const model = createScriptedModel({ respond: () => stop("hello") });
    const engine = testEngine();
    const agent = createAgent({
      engine,
      name: "single-turn",
      version: 1,
      model,
      instructions: "Answer directly.",
      maxIterations: 2,
    });
    const run = await agent.start({ id: "single-1", input: { message: "Hi" } });
    await expect(run.result()).resolves.toEqual({
      message: "hello",
      finish: "stop",
      iterations: 1,
      toolCalls: 0,
    });
    const steps = await engine.getSteps(run.id);
    expect(steps.map((step) => step.stepKey)).toEqual(["model-0"]);
    expect(model.invocations).toBe(1);
    expect((await engine.getRun(run.id))?.dataPolicy).toBe("device-only");
  });

  it("runs several tool calls one after another and keeps step keys stable", async () => {
    const order: string[] = [];
    const tools = [
      recordTool("get_room_info", order),
      recordTool("get_budget", order),
      recordTool("search_furniture", order, { query: { type: "string" } }, ["query"]),
    ];
    const model = createScriptedModel({
      respond(request) {
        const done = request.messages.filter((message) => message.role === "tool").length;
        if (done === 0) {
          return call("get_room_info");
        }
        if (done === 1) {
          return {
            message: null,
            finish: "tool_calls",
            calls: [
              { id: "budget", name: "get_budget", arguments: {} },
              { id: "search", name: "search_furniture", arguments: { query: "sofa" } },
            ],
          };
        }
        return stop("ready");
      },
    });
    const engine = testEngine();
    const agent = createAgent({
      engine,
      name: "multi-tool",
      version: 1,
      model,
      instructions: "Use the tools.",
      tools,
    });
    const result = await (
      await agent.start({ id: "multi-1", input: { message: "Plan" } })
    ).result();
    expect(result).toMatchObject({ message: "ready", toolCalls: 3, iterations: 3 });
    expect(order).toEqual(["get_room_info", "get_budget", "search_furniture"]);
    expect((await engine.getSteps("multi-1")).map((step) => step.stepKey)).toEqual([
      "model-0",
      "tool-0-0",
      "model-1",
      "tool-1-0",
      "tool-1-1",
      "model-2",
    ]);
    const stored = (await engine.getSteps("multi-1"))[0]?.output;
    expect(JSON.stringify(stored)).not.toContain("thinking");
    expect(JSON.stringify(await engine.getHistory("multi-1"))).not.toContain("Plan");
  });

  it("rejects an unknown tool name and invalid arguments without running a handler", async () => {
    const ran: string[] = [];
    const tool = defineTool({
      name: "search_furniture",
      description: "Search",
      inputSchema: {
        type: "object",
        properties: { query: { type: "string" } },
        required: ["query"],
        additionalProperties: false,
      },
      effects: "pure",
      run: () => {
        ran.push("search");
        return { items: [] };
      },
    });
    const model = createScriptedModel({
      respond(request) {
        const done = request.messages.filter((message) => message.role === "tool").length;
        if (done === 0) {
          return call("delete_everything");
        }
        if (done === 1) {
          return call("search_furniture", { query: 12 } as unknown as JsonObject);
        }
        return stop("corrected");
      },
    });
    const engine = testEngine();
    const agent = createAgent({
      engine,
      name: "invalid-tools",
      version: 1,
      model,
      instructions: "Use tools.",
      tools: [tool],
    });
    await expect(
      (await agent.start({ id: "invalid-1", input: { message: "Plan" } })).result(),
    ).resolves.toMatchObject({ message: "corrected", toolCalls: 2 });
    expect(ran).toEqual([]);
    const steps = await engine.getSteps("invalid-1");
    expect(JSON.stringify(steps[1]?.output)).toContain("Unknown tool");
    expect(JSON.stringify(steps[3]?.output)).toContain("Invalid arguments");
  });

  it("fails a malformed model response instead of executing it", async () => {
    const model = createScriptedModel({
      respond: () =>
        ({
          message: null,
          finish: "tool_calls",
          calls: [{ id: "bad", name: "get_room_info", arguments: "nope" }],
        }) as unknown as ModelResponse,
    });
    const engine = testEngine();
    const agent = createAgent({
      engine,
      name: "malformed",
      version: 1,
      model,
      instructions: "Use tools.",
      tools: [lookup],
    });
    await expect(
      (await agent.start({ id: "bad-1", input: { message: "Plan" } })).result(),
    ).rejects.toMatchObject({ code: "permanent_execution_failure" });
    expect(model.invocations).toBe(1);
    expect((await engine.getRun("bad-1"))?.status).toBe("FAILED");
  });

  it("stops at the iteration and invalid-tool limits", async () => {
    const looping = createScriptedModel({ respond: () => call("get_room_info") });
    const engine = testEngine();
    const agent = createAgent({
      engine,
      name: "limited",
      version: 1,
      model: looping,
      instructions: "Loop.",
      tools: [lookup],
      maxIterations: 2,
    });
    await expect(
      (await agent.start({ id: "limit-1", input: { message: "Plan" } })).result(),
    ).rejects.toMatchObject({ message: "Agent iteration limit reached." });
    expect(looping.invocations).toBe(2);

    const invalid = createScriptedModel({ respond: () => call("missing_tool") });
    const second = testEngine();
    const bounded = createAgent({
      engine: second,
      name: "invalid-limit",
      version: 1,
      model: invalid,
      instructions: "Loop.",
      maxInvalidToolRequests: 2,
      maxIterations: 6,
    });
    await expect(
      (await bounded.start({ id: "limit-2", input: { message: "Plan" } })).result(),
    ).rejects.toMatchObject({ message: "Invalid tool request limit reached." });
    expect(invalid.invocations).toBe(2);
  });

  it("retries a model failure and an idempotent tool without changing the operation id", async () => {
    let modelCalls = 0;
    const operationIds: string[] = [];
    const save = defineTool({
      name: "save_plan",
      description: "Save",
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
      effects: "idempotent",
      retry: { maxAttempts: 2, initialIntervalMs: 5, maxIntervalMs: 5, backoff: "fixed" },
      run: (_input, ctx) => {
        operationIds.push(ctx.operationId);
        if (operationIds.length === 1) {
          throw new LarkxError({
            code: "transient_execution_failure",
            message: "locked",
            retryable: true,
          });
        }
        return { id: ctx.operationId };
      },
    });
    const follow = createScriptedModel({
      respond(request) {
        const done = request.messages.filter((message) => message.role === "tool").length;
        if (done === 0) {
          modelCalls += 1;
          if (modelCalls === 1) {
            throw new LarkxError({
              code: "transient_execution_failure",
              message: "model busy",
              retryable: true,
            });
          }
          return call("save_plan");
        }
        return stop("saved");
      },
    });
    const engine = testEngine();
    const agent = createAgent({
      engine,
      name: "retries",
      version: 1,
      model: follow,
      instructions: "Save.",
      tools: [save],
      modelRetry: { maxAttempts: 2, initialIntervalMs: 5, maxIntervalMs: 5, backoff: "fixed" },
    });
    await expect(
      (await agent.start({ id: "retry-1", input: { message: "Save" } })).result(),
    ).resolves.toMatchObject({ message: "saved" });
    expect(modelCalls).toBe(2);
    expect(operationIds).toHaveLength(2);
    expect(operationIds[0]).toBe(operationIds[1]);
    const steps = await engine.getSteps("retry-1");
    expect(steps[0]?.attemptCount).toBe(2);
    expect(steps[1]?.attemptCount).toBe(2);
    expect(steps[0]?.operationId).not.toBe(steps[1]?.operationId);
  });

  it("cancels a model step that is still waiting", async () => {
    let release: () => void = () => undefined;
    const started = new Promise<void>((resolve) => {
      release = resolve;
    });
    const model = createScriptedModel({
      async respond(_request, context): Promise<ModelResponse> {
        release();
        return await new Promise((_resolve, reject) => {
          context.signal.addEventListener("abort", () => {
            reject(
              new LarkxError({
                code: "cancelled_execution",
                message: "Model call cancelled.",
                retryable: false,
              }),
            );
          });
        });
      },
    });
    const engine = testEngine();
    const agent = createAgent({
      engine,
      name: "cancel-agent",
      version: 1,
      model,
      instructions: "Wait.",
    });
    const run = await agent.start({ id: "cancel-1", input: { message: "Hi" } });
    await started;
    await run.cancel();
    await expect(run.result()).rejects.toMatchObject({ code: "cancelled_execution" });
  });

  it("blocks a missing version and a changed effect class", async () => {
    const storage = createMemoryStorage();
    const model = createScriptedModel({ respond: () => call("save_plan") });
    const first = testEngine(storage, {
      afterStepCommit(info) {
        if (info.stepKey === "model-0") {
          throw new EngineTermination();
        }
      },
    });
    const agent = createAgent({
      engine: first,
      name: "versioned",
      version: 1,
      model,
      instructions: "Save.",
      tools: [saveTool("idempotent")],
    });
    await expect(
      (await agent.start({ id: "version-1", input: { message: "Save" } })).result(),
    ).rejects.toMatchObject({ code: "execution_ownership_conflict" });

    const upgraded = testEngine(storage);
    createAgent({
      engine: upgraded,
      name: "versioned",
      version: 2,
      model,
      instructions: "Save.",
      tools: [saveTool("idempotent")],
    });
    await expect((await upgraded.resume("version-1")).result()).rejects.toMatchObject({
      code: "unknown_workflow_version",
    });

    const changedStorage = createMemoryStorage();
    const committed = testEngine(changedStorage, {
      afterStepCommit(info) {
        if (info.stepKey === "tool-0-0") {
          throw new EngineTermination();
        }
      },
    });
    const original = createAgent({
      engine: committed,
      name: "effects",
      version: 1,
      model: createScriptedModel({
        respond(request) {
          const done = request.messages.filter((message) => message.role === "tool").length;
          return done === 0 ? call("save_plan") : stop("done");
        },
      }),
      instructions: "Save.",
      tools: [saveTool("idempotent")],
    });
    await expect(
      (await original.start({ id: "effects-1", input: { message: "Save" } })).result(),
    ).rejects.toMatchObject({ code: "execution_ownership_conflict" });
    const diverged = testEngine(changedStorage);
    createAgent({
      engine: diverged,
      name: "effects",
      version: 1,
      model: createScriptedModel({ respond: () => stop("done") }),
      instructions: "Save.",
      tools: [saveTool("pure")],
    });
    await expect((await diverged.resume("effects-1")).result()).rejects.toMatchObject({
      code: "replay_divergence",
    });
  });

  it("does not repeat a committed model decision or a committed tool result", async () => {
    const storage = createMemoryStorage();
    const model = createScriptedModel({
      respond(request) {
        const done = request.messages.filter((message) => message.role === "tool").length;
        return done === 0 ? call("save_plan") : stop("done");
      },
    });
    let toolRuns = 0;
    const save = defineTool({
      name: "save_plan",
      description: "Save",
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
      effects: "idempotent",
      run: (_input, ctx) => {
        toolRuns += 1;
        return { id: ctx.operationId };
      },
    });
    const first = testEngine(storage, {
      afterStepCommit(info) {
        if (info.stepKey === "model-0") {
          throw new EngineTermination();
        }
      },
    });
    const agent = createAgent({
      engine: first,
      name: "replay-agent",
      version: 1,
      model,
      instructions: "Save.",
      tools: [save],
    });
    await expect(
      (await agent.start({ id: "replay-1", input: { message: "Save" } })).result(),
    ).rejects.toMatchObject({ code: "execution_ownership_conflict" });
    expect(model.invocations).toBe(1);
    expect(toolRuns).toBe(0);

    const second = testEngine(storage, {
      afterStepCommit(info) {
        if (info.stepKey === "tool-0-0") {
          throw new EngineTermination();
        }
      },
    });
    createAgent({
      engine: second,
      name: "replay-agent",
      version: 1,
      model,
      instructions: "Save.",
      tools: [save],
    });
    await expect((await second.resume("replay-1")).result()).rejects.toMatchObject({
      code: "execution_ownership_conflict",
    });
    expect(model.invocations).toBe(1);
    expect(toolRuns).toBe(1);

    const third = testEngine(storage);
    createAgent({
      engine: third,
      name: "replay-agent",
      version: 1,
      model,
      instructions: "Save.",
      tools: [save],
    });
    await expect((await third.resume("replay-1")).result()).resolves.toMatchObject({
      message: "done",
    });
    expect(model.invocations).toBe(2);
    expect(toolRuns).toBe(1);
  });

  it("restarts an uncommitted model call", async () => {
    const storage = createMemoryStorage();
    let attempts = 0;
    const model = createScriptedModel({
      respond() {
        attempts += 1;
        if (attempts === 1) {
          throw new EngineTermination();
        }
        return stop("continued");
      },
    });
    const engine = testEngine(storage);
    const agent = createAgent({
      engine,
      name: "inference",
      version: 1,
      model,
      instructions: "Answer.",
    });
    await expect(
      (await agent.start({ id: "infer-1", input: { message: "Hi" } })).result(),
    ).rejects.toMatchObject({ code: "execution_ownership_conflict" });
    expect(attempts).toBe(1);
    const recovered = testEngine(storage);
    createAgent({
      engine: recovered,
      name: "inference",
      version: 1,
      model,
      instructions: "Answer.",
    });
    await expect((await recovered.resume("infer-1")).result()).resolves.toMatchObject({
      message: "continued",
    });
    expect(attempts).toBe(2);
    expect((await recovered.getSteps("infer-1"))[0]?.attemptCount).toBe(2);
  });

  it("blocks an interrupted non-idempotent tool until reconcile", async () => {
    const storage = createMemoryStorage();
    let toolRuns = 0;
    const model = createScriptedModel({
      respond(request) {
        const done = request.messages.filter((message) => message.role === "tool").length;
        return done === 0 ? call("charge") : stop("reconciled");
      },
    });
    const charge = defineTool({
      name: "charge",
      description: "Charge once",
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
      effects: "non-idempotent",
      run: () => {
        toolRuns += 1;
        throw new LarkxError({
          code: "transient_execution_failure",
          message: "The charge may have landed.",
          retryable: true,
        });
      },
    });
    const engine = testEngine(storage);
    const agent = createAgent({
      engine,
      name: "charge-agent",
      version: 1,
      model,
      instructions: "Charge.",
      tools: [charge],
    });
    await expect(
      (await agent.start({ id: "charge-1", input: { message: "Charge" } })).result(),
    ).rejects.toMatchObject({ code: "unknown_operation_outcome" });
    expect(toolRuns).toBe(1);
    expect(model.invocations).toBe(1);

    const again = testEngine(storage);
    createAgent({
      engine: again,
      name: "charge-agent",
      version: 1,
      model,
      instructions: "Charge.",
      tools: [charge],
    });
    await expect((await again.resume("charge-1")).result()).rejects.toMatchObject({
      code: "unknown_operation_outcome",
    });
    expect(toolRuns).toBe(1);
    expect(model.invocations).toBe(1);
    await again.reconcileStep("charge-1", "tool-0-0", {
      resolution: "complete",
      output: {
        ok: true,
        name: "charge",
        callId: "charge",
        output: { accepted: true },
        error: null,
      },
    });
    await expect((await again.resume("charge-1")).result()).resolves.toMatchObject({
      message: "reconciled",
    });
    expect(toolRuns).toBe(1);
    expect(model.invocations).toBe(2);
  });

  it("rejects a context overflow and a non-JSON tool output", async () => {
    const model = createScriptedModel({ respond: () => stop("no") });
    const engine = testEngine();
    const agent = createAgent({
      engine,
      name: "context",
      version: 1,
      model,
      instructions: "x".repeat(200),
      maxContextChars: 40,
    });
    await expect(
      (await agent.start({ id: "context-1", input: { message: "Hi" } })).result(),
    ).rejects.toMatchObject({ message: "Context limit exceeded." });
    expect(model.invocations).toBe(0);

    const bad = defineTool({
      name: "save_plan",
      description: "Save",
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
      effects: "pure",
      run: () => (() => "secret") as unknown as JsonValue,
    });
    const second = testEngine();
    const agent2 = createAgent({
      engine: second,
      name: "serialize",
      version: 1,
      model: createScriptedModel({ respond: () => call("save_plan") }),
      instructions: "Save.",
      tools: [bad],
    });
    await expect(
      (await agent2.start({ id: "serialize-1", input: { message: "secret-room-plan" } })).result(),
    ).rejects.toMatchObject({ code: "serialization_failure" });
    expect(JSON.stringify(await second.getHistory("serialize-1"))).not.toContain(
      "secret-room-plan",
    );
  });

  it("registers the same workflow twice and rejects a second object", async () => {
    const engine = testEngine();
    const model = createScriptedModel({ respond: () => stop("ok") });
    const agent = createAgent({
      engine,
      name: "registered",
      version: 1,
      model,
      instructions: "Answer.",
    });
    expect(() => engine.register(agent.workflow)).not.toThrow();
    expect(() =>
      createAgent({
        engine,
        name: "registered",
        version: 1,
        model,
        instructions: "Answer.",
      }),
    ).toThrow(LarkxError);
  });
});

function recordTool(
  name: string,
  order: string[],
  properties: Record<string, JsonSchema> = {},
  required?: string[],
): Tool {
  return defineTool({
    name,
    description: name,
    inputSchema: {
      type: "object",
      properties,
      ...(required !== undefined ? { required } : {}),
      additionalProperties: false,
    },
    effects: "pure",
    run: () => {
      order.push(name);
      return { ok: true };
    },
  });
}

function saveTool(effects: "pure" | "idempotent"): Tool {
  return defineTool({
    name: "save_plan",
    description: "Save",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    effects,
    run: () => ({ saved: true }),
  });
}
