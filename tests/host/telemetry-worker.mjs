import { writeFileSync } from "node:fs";

import {
  createRuntime,
  defineTool,
  larkxCloud,
  remoteAgent,
  scriptedModel,
  sqlite,
} from "@larkxai/node";

const [mode, database, endpoint = "http://127.0.0.1:9", extra = "", flag = ""] =
  process.argv.slice(2);
const secret = "SECRET_PROMPT_DO_NOT_EXPORT";
const modelText = "SECRET_MODEL_TEXT_DO_NOT_EXPORT";
const toolResult = "SECRET_TOOL_RESULT_DO_NOT_EXPORT";
const toolArgument = "SECRET_TOOL_ARGUMENT_DO_NOT_EXPORT";
const errorText = "SECRET_ERROR_MESSAGE_DO_NOT_EXPORT";

if (mode === "before-send") {
  globalThis.__larkxTelemetryHooks = {
    beforeRequest() {
      process.kill(process.pid, "SIGKILL");
    },
  };
}
if (mode === "after-ack") {
  globalThis.__larkxTelemetryHooks = {
    beforeCheckpoint() {
      process.kill(process.pid, "SIGKILL");
    },
  };
}

const runtime = await createRuntime({
  storage: sqlite(database),
  ownerId: "telemetry-worker",
  leaseMs: 0,
  isOnline: () => mode !== "offline",
  telemetry: larkxCloud({
    projectId: "field",
    apiKey: "lkx_ing_worker",
    endpoint,
    flushIntervalMs: 0,
    requestTimeoutMs: 5_000,
    metadata: { appName: "telemetry-worker", platform: "node", sdkVersion: "0.3.0" },
  }),
});

if (mode === "resume" || mode === "langgraph-resume") {
  runtime.createAgent(agentOptions(mode));
  const run = await runtime.resume("inspect-1");
  const result = await run.result();
  await runtime.flushTelemetry();
  const history = await run.getHistory();
  process.stdout.write(
    `${JSON.stringify({
      message: result.message,
      types: history.events.map((event) => event.type),
    })}\n`,
  );
  await runtime.close();
  process.exit(0);
}

const agent = runtime.createAgent(agentOptions(mode));
if (mode === "langgraph-hold") {
  runtime.holdExecution(async (event) => {
    if (event.type === "remote-waiting") {
      writeFileSync(flag, "waiting");
      await stayAlive();
    }
  });
}
const run = await agent.start({ message: secret, runId: "inspect-1" });
if (mode === "hold-tool") {
  await run.result();
}
if (mode === "fail-tool") {
  await run.result().catch(() => undefined);
}
if (mode !== "hold-tool" && mode !== "fail-tool" && mode !== "langgraph-hold") {
  await run.result();
}
if (mode === "offline") {
  await runtime.close();
  process.exit(0);
}
if (mode === "after-cursor") {
  await runtime.flushTelemetry();
  process.kill(process.pid, "SIGKILL");
}
if (mode === "langgraph-hold" || mode === "hold-tool") {
  await stayAlive();
}
await runtime.flushTelemetry();
await runtime.close();

function agentOptions(kind) {
  if (kind === "langgraph-hold" || kind === "langgraph-resume") {
    return {
      name: "field-assistant",
      version: 1,
      instructions: secret,
      model: historyModel((text) => {
        if (text.includes("procurement-agent")) {
          return {
            message: text.includes("Example Industrial Supply")
              ? "Saved Example Industrial Supply."
              : "Saved the simulated supplier recommendation.",
            finish: "stop",
            calls: [],
          };
        }
        if (text.includes("read_notes")) {
          return {
            message: null,
            finish: "tool_calls",
            calls: [
              {
                id: "remote-1",
                name: "procurement-agent",
                arguments: { component: "mechanical seal", equipment: "pump model P-104" },
              },
            ],
          };
        }
        return {
          message: null,
          finish: "tool_calls",
          calls: [{ id: "local-1", name: "read_notes", arguments: {} }],
        };
      }),
      tools: [readNotes()],
      remoteAgents: [
        remoteAgent({
          name: "procurement-agent",
          description: "Find compatible replacement parts and suppliers.",
          transport: { type: "a2a", endpoint: extra, discover: true, pollIntervalMs: 50 },
        }),
      ],
    };
  }
  return {
    name: "field-assistant",
    version: 1,
    instructions: secret,
    model:
      kind === "fail-tool"
        ? scriptedModel([
            {
              message: null,
              finish: "tool_calls",
              calls: [{ id: "c1", name: "read_notes", arguments: { note: toolArgument } }],
            },
          ])
        : historyModel((text) => {
            if (text.includes("read_notes")) {
              return {
                message: modelText,
                finish: "stop",
                calls: [],
                usage: { inputTokens: 11, outputTokens: 7 },
                timingMs: { timeToFirstToken: 4 },
              };
            }
            return {
              message: null,
              finish: "tool_calls",
              calls: [{ id: "c1", name: "read_notes", arguments: { note: toolArgument } }],
            };
          }),
    tools: [
      kind === "fail-tool"
        ? failingNotes()
        : kind === "hold-tool"
          ? holdingNotes(flag)
          : readNotes(),
    ],
  };
}

function stayAlive() {
  return new Promise(() => {
    setInterval(() => undefined, 60_000);
  });
}

function historyModel(choose) {
  return {
    id: "scripted",
    model: "scripted-1",
    capabilities: { toolCalling: true },
    async complete(request) {
      return choose(JSON.stringify(request.messages));
    },
  };
}

function readNotes() {
  return defineTool({
    name: "read_notes",
    description: "Read local inspection notes",
    schema: { type: "object", properties: { note: { type: "string" } } },
    effects: "pure",
    handler: () => ({ notes: toolResult }),
  });
}

function failingNotes() {
  return defineTool({
    name: "read_notes",
    description: "Read local inspection notes",
    schema: { type: "object", properties: { note: { type: "string" } } },
    effects: "pure",
    handler: () => {
      throw new Error(errorText);
    },
  });
}

function holdingNotes(flagPath) {
  return defineTool({
    name: "read_notes",
    description: "Read local inspection notes",
    schema: {
      type: "object",
      properties: { note: { type: "string" } },
      additionalProperties: false,
    },
    effects: "pure",
    handler: async () => {
      writeFileSync(flagPath, "in-tool");
      await stayAlive();
      return { notes: toolResult };
    },
  });
}
