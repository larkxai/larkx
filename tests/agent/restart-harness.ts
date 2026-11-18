import { createAgent, createScriptedModel, defineTool, type ModelResponse } from "@larkx/agent";
import { createNodeEngine } from "@larkx/node";
import { closeSync, fsyncSync, mkdirSync, openSync, writeSync } from "node:fs";
import { dirname } from "node:path";

interface Args {
  database: string;
  log: string;
  crashDuring?: "model" | "tool" | "unsafe";
}

const args = parseArgs(process.argv.slice(2));
const RUN_ID = "agent-restart";

const mark = defineTool({
  name: "mark",
  description: "Record an idempotent mark",
  inputSchema: { type: "object", properties: {}, additionalProperties: false },
  effects: "idempotent",
  run: (_input, ctx) => {
    record(`tool ${ctx.operationId}`);
    crashIf("tool");
    return { operationId: ctx.operationId };
  },
});

const charge = defineTool({
  name: "charge",
  description: "Record a non-idempotent charge",
  inputSchema: { type: "object", properties: {}, additionalProperties: false },
  effects: "non-idempotent",
  run: (_input, ctx) => {
    record(`unsafe ${ctx.operationId}`);
    crashIf("unsafe");
    return { operationId: ctx.operationId };
  },
});

const model = createScriptedModel({
  respond(request): ModelResponse {
    const completed = request.messages.filter((message) => message.role === "tool").length;
    record("model");
    if (completed === 0) {
      crashIf("model");
      const name = args.crashDuring === "unsafe" ? "charge" : "mark";
      return {
        message: null,
        finish: "tool_calls",
        calls: [{ id: "call-0", name, arguments: {} }],
      };
    }
    return { message: "saved", finish: "stop", calls: [] };
  },
});

const engine = createNodeEngine({ database: args.database, workflows: [], heartbeat: false });
const agent = createAgent({
  engine,
  name: "restart-agent",
  version: 1,
  model,
  instructions: "Call one tool, then stop.",
  tools: [mark, charge],
});

try {
  const existing = await engine.getRun(RUN_ID);
  const handle = existing
    ? (await engine.recover()).find((item) => item.id === RUN_ID)
    : await agent.start({ id: RUN_ID, input: { message: "Plan the room" } });
  if (!handle) {
    const snapshot = await engine.getRun(RUN_ID);
    writeResult({ status: snapshot?.status ?? "BLOCKED", output: snapshot?.output ?? null });
    await engine.close();
    process.exitCode = snapshot?.status === "BLOCKED" ? 2 : 1;
  } else {
    const output = await handle.result();
    writeResult({ status: "COMPLETED", output, steps: await engine.getSteps(handle.id) });
    await engine.close();
  }
} catch (error) {
  const snapshot = await engine.getRun(RUN_ID).catch(() => null);
  writeResult({
    status: snapshot?.status ?? "FAILED",
    error: error instanceof Error ? error.message : "unknown error",
    steps: await engine.getSteps(RUN_ID).catch(() => []),
  });
  await engine.close();
  process.exitCode = snapshot?.status === "BLOCKED" ? 2 : 1;
}

function crashIf(step: "model" | "tool" | "unsafe"): void {
  if (args.crashDuring === step) {
    process.kill(process.pid, "SIGKILL");
  }
}

function record(line: string): void {
  mkdirSync(dirname(args.log), { recursive: true });
  const file = openSync(args.log, "a");
  try {
    writeSync(file, `${line}\n`);
    fsyncSync(file);
  } finally {
    closeSync(file);
  }
}

function writeResult(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value)}\n`);
}

function parseArgs(argv: string[]): Args {
  const values = new Map<string, string>();
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (key?.startsWith("--") && value !== undefined) {
      values.set(key.slice(2), value);
    }
  }
  const database = values.get("database");
  const log = values.get("log");
  if (!database || !log) {
    throw new Error("--database and --log are required");
  }
  const crashDuring = values.get("crash-during");
  if (
    crashDuring !== undefined &&
    crashDuring !== "model" &&
    crashDuring !== "tool" &&
    crashDuring !== "unsafe"
  ) {
    throw new Error("--crash-during must be model, tool, or unsafe");
  }
  return {
    database,
    log,
    ...(crashDuring !== undefined ? { crashDuring } : {}),
  };
}
