import { createAgent, createScriptedModel, defineTool } from "@larkx/agent";
import type { ModelResponse } from "@larkx/agent";
import { createNodeEngine, createNodeSqliteDriver } from "@larkx/node";
import {
  createCloudTelemetry,
  createMemoryTelemetryStore,
  createSqliteTelemetryStore,
  journalFromEngine,
  type CloudTelemetry,
} from "@larkx/telemetry";

const room = defineTool({
  name: "get_room_info",
  description: "Read the living room",
  inputSchema: { type: "object", properties: {}, additionalProperties: false },
  effects: "pure",
  run: () => ({ name: "Living room", lengthM: 6, widthM: 4 }),
});

const budget = defineTool({
  name: "get_budget",
  description: "Read the renovation budget",
  inputSchema: { type: "object", properties: {}, additionalProperties: false },
  effects: "pure",
  run: () => ({ currency: "USD", remaining: 2000 }),
});

const search = defineTool({
  name: "search_furniture",
  description: "Search the bundled catalog",
  inputSchema: {
    type: "object",
    properties: { query: { type: "string" } },
    required: ["query"],
    additionalProperties: false,
  },
  effects: "pure",
  run: (input: { query: string }) => ({
    query: input.query,
    items: [{ name: "Linen sofa", price: 900 }],
  }),
});

const save = defineTool({
  name: "save_plan",
  description: "Save the plan locally",
  inputSchema: {
    type: "object",
    properties: {
      title: { type: "string" },
      summary: { type: "string" },
      totalCost: { type: "number" },
    },
    required: ["title", "summary", "totalCost"],
    additionalProperties: false,
  },
  effects: "idempotent",
  run: (input: { title: string; summary: string; totalCost: number }, ctx) => ({
    id: ctx.operationId,
    ...input,
  }),
});

const model = createScriptedModel({
  id: "scripted",
  model: "scripted-renovation",
  respond(request): ModelResponse {
    const completed = request.messages.filter((message) => message.role === "tool").length;
    if (completed === 0) {
      return call("get_room_info", {});
    }
    if (completed === 1) {
      return call("get_budget", {});
    }
    if (completed === 2) {
      return call("search_furniture", { query: "sofa" });
    }
    if (completed === 3) {
      return call("save_plan", {
        title: "Living room",
        summary: "Linen sofa within the $2,000 budget.",
        totalCost: 900,
      });
    }
    return { message: "Saved a living-room plan for $900.", finish: "stop", calls: [] };
  },
});

const database = process.argv[2] ?? ":memory:";
const endpoint = process.env.LARKX_CLOUD_ENDPOINT?.trim() ?? "";
const apiKey = process.env.LARKX_INGESTION_KEY?.trim() ?? "";
const engine = createNodeEngine({ database, workflows: [], heartbeat: false });
const cloud = openTelemetry(engine, database, endpoint, apiKey);
const agent = createAgent({
  engine,
  name: "renovation-agent",
  version: 1,
  model,
  instructions: "Plan a living-room renovation from local tools only.",
  tools: [room, budget, search, save],
  maxIterations: 8,
});

const run = await agent.start({
  id: "renovation-node",
  input: { message: "Create a renovation plan for my living room with a $2,000 budget." },
});
const result = await run.result();
const steps = await engine.getSteps(run.id);
let sync: { phase: string; error: string | null } | null = null;
if (cloud.telemetry) {
  const flushed = await cloud.telemetry.flush();
  sync = { phase: flushed.phase, error: flushed.error };
}
process.stdout.write(
  `${JSON.stringify({ result, steps: steps.map((step) => step.stepKey), cloud: sync }, null, 2)}\n`,
);
await cloud.telemetry?.stop();
cloud.driver?.close();
await engine.close();

function openTelemetry(
  runtime: Parameters<typeof journalFromEngine>[0],
  databasePath: string,
  cloudEndpoint: string,
  cloudKey: string,
): { telemetry: CloudTelemetry | null; driver: { close(): void } | null } {
  if (cloudEndpoint.length === 0 || cloudKey.length === 0) {
    return { telemetry: null, driver: null };
  }
  const driver =
    databasePath === ":memory:" ? null : createNodeSqliteDriver(`${databasePath}.telemetry`);
  const telemetry = createCloudTelemetry({
    endpoint: cloudEndpoint,
    apiKey: cloudKey,
    journal: journalFromEngine(runtime),
    state: driver ? createSqliteTelemetryStore(driver) : createMemoryTelemetryStore(),
    appId: process.env.LARKX_APP_ID?.trim() || "node-agent",
    runtime: "node",
    intervalMs: 0,
  });
  return { telemetry, driver };
}

function call(name: string, args: ModelResponse["calls"][number]["arguments"]): ModelResponse {
  return { message: null, finish: "tool_calls", calls: [{ id: name, name, arguments: args }] };
}
