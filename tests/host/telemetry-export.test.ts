import { spawn, type ChildProcess } from "node:child_process";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  createRuntime,
  defineTool,
  larkxCloud,
  remoteAgent,
  scriptedModel,
  sqlite,
  type TelemetryExporter,
} from "@larkxai/node";
import { allowEventPayload } from "@larkxai/telemetry";
import { describe, expect, it } from "vitest";

import { runProcurement } from "../../examples/langgraph-a2a-agent/src/graph.js";

const workerPath = fileURLToPath(new URL("./telemetry-worker.mjs", import.meta.url));
const langGraphServer = fileURLToPath(
  new URL("../../examples/langgraph-a2a-agent/dist/server.js", import.meta.url),
);

const SECRET_PROMPT = "SECRET_PROMPT_DO_NOT_EXPORT";
const SECRET_MODEL = "SECRET_MODEL_TEXT_DO_NOT_EXPORT";
const SECRET_RESULT = "SECRET_TOOL_RESULT_DO_NOT_EXPORT";
const SECRET_ARGUMENT = "SECRET_TOOL_ARGUMENT_DO_NOT_EXPORT";
const SECRET_ERROR = "SECRET_ERROR_MESSAGE_DO_NOT_EXPORT";
const SECRET_HEADER = "SECRET_AUTH_HEADER_DO_NOT_EXPORT";
const SECRET_URL = "SECRET_URL_TOKEN_DO_NOT_EXPORT";
const SECRET_INPUT = "SECRET_REMOTE_INPUT_DO_NOT_EXPORT";

describe("native execution telemetry", () => {
  it("stays disabled until a destination is configured", async () => {
    const directory = mkdtempSync(join(tmpdir(), "larkx-telemetry-off-"));
    const runtime = await createRuntime({
      storage: sqlite(join(directory, "agent.db")),
      ownerId: "telemetry",
      leaseMs: 0,
    });
    const agent = runtime.createAgent({
      name: "field-assistant",
      version: 1,
      model: scriptedModel([{ message: "Done.", finish: "stop", calls: [] }]),
      instructions: SECRET_PROMPT,
    });
    expect((await (await agent.start({ message: SECRET_PROMPT })).result()).message).toBe("Done.");
    expect(runtime.telemetryStatus().enabled).toBe(false);
    expect((await runtime.flushTelemetry()).enabled).toBe(false);
    await runtime.close();
    expect(() => readFileSync(join(directory, "agent.db.telemetry"))).toThrow();
  });

  it("exports allowlisted metadata and drops prompts, results, headers, and urls", async () => {
    const received: string[] = [];
    const headersSeen: string[] = [];
    const peer = createServer((request, response) => {
      void readBody(request).then(() => {
        headersSeen.push(request.headers.authorization ?? "");
        if (request.method === "POST") {
          respondJson(response, 202, { taskId: "task-9", status: "accepted" });
          return;
        }
        respondJson(response, 200, {
          taskId: "task-9",
          status: "completed",
          result: { note: SECRET_RESULT },
        });
      });
    });
    const peerPort = await listen(peer);
    const collector = await startCollector(async (_body, response) => {
      respondJson(response, 200, ack(JSON.parse(_body) as BatchBody));
    }, received);
    const directory = mkdtempSync(join(tmpdir(), "larkx-telemetry-privacy-"));
    const runtime = await createRuntime({
      storage: sqlite(join(directory, "agent.db")),
      ownerId: "telemetry",
      leaseMs: 0,
      telemetry: larkxCloud({
        projectId: "field",
        apiKey: "lkx_ing_privacy",
        endpoint: collector.url,
        flushIntervalMs: 0,
        metadata: { appName: "field", platform: "node", sdkVersion: "0.3.0" },
      }),
    });
    const agent = runtime.createAgent({
      name: "field-assistant",
      version: 1,
      instructions: SECRET_PROMPT,
      model: scriptedModel([
        {
          message: null,
          finish: "tool_calls",
          calls: [{ id: "c1", name: "read_notes", arguments: { note: SECRET_ARGUMENT } }],
        },
        {
          message: null,
          finish: "tool_calls",
          calls: [
            {
              id: "remote-1",
              name: "procurement-agent",
              arguments: { question: SECRET_INPUT },
            },
          ],
        },
        {
          message: SECRET_MODEL,
          finish: "stop",
          calls: [],
          usage: { inputTokens: 11, outputTokens: 7 },
          timingMs: { timeToFirstToken: 4 },
        },
      ]),
      tools: [
        defineTool({
          name: "read_notes",
          description: "Read notes",
          schema: { type: "object", properties: { note: { type: "string" } } },
          effects: "pure",
          handler: () => ({ notes: SECRET_RESULT }),
        }),
      ],
      remoteAgents: [
        remoteAgent({
          name: "procurement-agent",
          description: "Supplier lookup",
          transport: {
            type: "http",
            endpoint: `http://127.0.0.1:${String(peerPort)}/${SECRET_URL}`,
            pollIntervalMs: 50,
            headers: () => ({ authorization: `Bearer ${SECRET_HEADER}` }),
          },
        }),
      ],
    });
    const run = await agent.start({ message: SECRET_PROMPT, runId: "inspect-1" });
    const result = await run.result();
    expect(result.message).toContain(SECRET_MODEL);
    expect(headersSeen.some((value) => value.includes(SECRET_HEADER))).toBe(true);
    const status = await runtime.flushTelemetry();
    expect(status.phase).toBe("idle");
    expect(status.pendingEvents).toBe(0);
    expect(status.lastError).toBeNull();
    const body = received.join("\n");
    for (const secret of [
      SECRET_PROMPT,
      SECRET_MODEL,
      SECRET_RESULT,
      SECRET_ARGUMENT,
      SECRET_ERROR,
      SECRET_HEADER,
      SECRET_URL,
      SECRET_INPUT,
      "lkx_ing_privacy",
    ]) {
      expect(body).not.toContain(secret);
    }
    const events = received.flatMap((item) => eventsOf(item));
    expect(
      events.some((event) => event.type === "STEP_COMPLETED" && event.payload.kind === "model"),
    ).toBe(true);
    const model = events.find(
      (event) => event.type === "STEP_COMPLETED" && event.payload.inputTokens === 11,
    );
    expect(model?.payload).toMatchObject({
      modelId: "scripted-1",
      inputTokens: 11,
      outputTokens: 7,
      timeToFirstTokenMs: 4,
    });
    expect(typeof model?.payload.durationMs).toBe("number");
    expect(
      events.some((event) => event.type === "STEP_COMPLETED" && event.payload.kind === "tool"),
    ).toBe(true);
    expect(
      events.some(
        (event) =>
          event.type === "REMOTE_DISPATCH_ACCEPTED" &&
          event.payload.transport === "http" &&
          event.payload.taskId === "task-9" &&
          event.payload.remoteAgent === "procurement-agent",
      ),
    ).toBe(true);
    expect(
      events.every((event) => event.eventId.length > 0 && typeof event.sequence === "number"),
    ).toBe(true);
    const first = JSON.parse(received[0] ?? "{}") as BatchBody;
    expect(first.telemetryVersion).toBe(1);
    expect(first.storageSchemaVersion).toBe(3);
    expect(first.mode).toBe("metadata-only");
    expect(first.source.appId).toBe("field");
    await runtime.close();
    await closeServer(collector.server);
    await closeServer(peer);
  });

  it("keeps a run successful when the collector fails", async () => {
    const cases: Array<{ status: number; body: string; error: string }> = [
      { status: 429, body: "", error: "offline" },
      { status: 503, body: "", error: "offline" },
      { status: 401, body: "", error: "unauthorized" },
      { status: 400, body: JSON.stringify({ error: "invalid_batch" }), error: "invalid_batch" },
      { status: 200, body: '{"ok":true}', error: "malformed_ack" },
    ];
    for (const item of cases) {
      const received: string[] = [];
      const collector = await startCollector(async (_body, response) => {
        response.writeHead(item.status, { "content-type": "application/json" });
        response.end(item.body);
      }, received);
      const directory = mkdtempSync(join(tmpdir(), "larkx-telemetry-fail-"));
      const runtime = await createRuntime({
        storage: sqlite(join(directory, "agent.db")),
        ownerId: "telemetry",
        leaseMs: 0,
        telemetry: larkxCloud({
          projectId: "field",
          apiKey: "lkx_ing_fail",
          endpoint: collector.url,
          flushIntervalMs: 0,
        }),
      });
      const agent = runtime.createAgent({
        name: "field-assistant",
        version: 1,
        model: scriptedModel([{ message: "Done.", finish: "stop", calls: [] }]),
        instructions: "Inspect.",
      });
      expect((await (await agent.start({ message: "Inspect." })).result()).message).toBe("Done.");
      const status = await runtime.flushTelemetry();
      expect(status.lastError).toBe(item.error);
      expect(runtime.telemetryStatus().enabled).toBe(true);
      await runtime.close();
      await closeServer(collector.server);
    }
  });

  it("retries a timed-out post without failing the run", async () => {
    const received: string[] = [];
    const collector = await startCollector(async () => {
      await new Promise(() => undefined);
    }, received);
    const directory = mkdtempSync(join(tmpdir(), "larkx-telemetry-timeout-"));
    const runtime = await createRuntime({
      storage: sqlite(join(directory, "agent.db")),
      ownerId: "telemetry",
      leaseMs: 0,
      telemetry: larkxCloud({
        projectId: "field",
        apiKey: "lkx_ing_timeout",
        endpoint: collector.url,
        flushIntervalMs: 0,
        requestTimeoutMs: 200,
      }),
    });
    const agent = runtime.createAgent({
      name: "field-assistant",
      version: 1,
      model: scriptedModel([{ message: "Done.", finish: "stop", calls: [] }]),
      instructions: "Inspect.",
    });
    expect((await (await agent.start({ message: "Inspect." })).result()).message).toBe("Done.");
    const status = await runtime.flushTelemetry();
    expect(status.lastError).toBe("offline");
    await runtime.close();
    collector.server.closeAllConnections?.();
    await closeServer(collector.server);
  });

  it("rejects an ingestion key that is not scoped", async () => {
    const directory = mkdtempSync(join(tmpdir(), "larkx-telemetry-key-"));
    const runtime = await createRuntime({
      storage: sqlite(join(directory, "agent.db")),
      ownerId: "telemetry",
      leaseMs: 0,
      telemetry: larkxCloud({
        projectId: "field",
        apiKey: "admin-secret",
        endpoint: "http://127.0.0.1:9",
        flushIntervalMs: 0,
      }),
    });
    const agent = runtime.createAgent({
      name: "field-assistant",
      version: 1,
      model: scriptedModel([{ message: "Done.", finish: "stop", calls: [] }]),
      instructions: "Inspect.",
    });
    expect((await (await agent.start({ message: "Inspect." })).result()).message).toBe("Done.");
    expect((await runtime.flushTelemetry()).lastError).toBe("unauthorized");
    await runtime.close();
  });

  it("advances only through the acknowledged prefix", async () => {
    const received: string[] = [];
    let posts = 0;
    const collector = await startCollector(async (body, response) => {
      posts += 1;
      const parsed = JSON.parse(body) as BatchBody;
      const run = parsed.runs[0];
      const through =
        posts === 1 && run !== undefined && run.fromSequence < run.throughSequence
          ? run.fromSequence
          : (run?.throughSequence ?? 0);
      respondJson(response, 200, {
        telemetryVersion: 1,
        batchId: parsed.batchId,
        results: [
          {
            runId: run?.runId,
            status: "accepted",
            acceptedThroughSequence: through,
          },
        ],
      });
    }, received);
    const directory = mkdtempSync(join(tmpdir(), "larkx-telemetry-partial-"));
    const runtime = await createRuntime({
      storage: sqlite(join(directory, "agent.db")),
      ownerId: "telemetry",
      leaseMs: 0,
      telemetry: larkxCloud({
        projectId: "field",
        apiKey: "lkx_ing_partial",
        endpoint: collector.url,
        flushIntervalMs: 0,
        batchSize: 2,
      }),
    });
    const agent = runtime.createAgent({
      name: "field-assistant",
      version: 1,
      model: scriptedModel([
        {
          message: null,
          finish: "tool_calls",
          calls: [{ id: "c1", name: "read_notes", arguments: {} }],
        },
        { message: "Done.", finish: "stop", calls: [] },
      ]),
      instructions: "Inspect.",
      tools: [
        defineTool({
          name: "read_notes",
          description: "Read notes",
          schema: { type: "object", properties: {} },
          effects: "pure",
          handler: () => ({ notes: "local" }),
        }),
      ],
    });
    expect((await (await agent.start({ message: "Inspect." })).result()).message).toBe("Done.");
    const status = await runtime.flushTelemetry();
    expect(status.pendingEvents).toBe(0);
    expect(posts).toBeGreaterThan(1);
    for (const body of received) {
      expect(eventsOf(body).length).toBeLessThanOrEqual(2);
    }
    await runtime.close();
    await closeServer(collector.server);
  });

  it("accepts a custom exporter and stops flushing after close", async () => {
    let delivered = 0;
    const exporter: TelemetryExporter = {
      start() {},
      async flush() {
        delivered += 1;
        return { delivered: true, phase: "idle", error: null };
      },
      async stop() {},
      current() {
        return {
          phase: "idle",
          pendingEvents: 0,
          lastError: null,
          lastSyncedAt: 5,
          installationId: "installation",
        };
      },
    };
    const received: string[] = [];
    const collector = await startCollector(async (body, response) => {
      respondJson(response, 200, ack(JSON.parse(body) as BatchBody));
    }, received);
    const directory = mkdtempSync(join(tmpdir(), "larkx-telemetry-custom-"));
    const runtime = await createRuntime({
      storage: sqlite(join(directory, "agent.db")),
      ownerId: "telemetry",
      leaseMs: 0,
      telemetry: { exporter },
    });
    const timedDirectory = mkdtempSync(join(tmpdir(), "larkx-telemetry-timer-"));
    const timed = await createRuntime({
      storage: sqlite(join(timedDirectory, "agent.db")),
      ownerId: "telemetry",
      leaseMs: 0,
      telemetry: larkxCloud({
        projectId: "field",
        apiKey: "lkx_ing_timer",
        endpoint: collector.url,
        flushIntervalMs: 40,
      }),
    });
    const agent = timed.createAgent({
      name: "field-assistant",
      version: 1,
      model: scriptedModel([{ message: "Done.", finish: "stop", calls: [] }]),
      instructions: "Inspect.",
    });
    expect((await (await agent.start({ message: "Inspect." })).result()).message).toBe("Done.");
    await waitFor(() => received.length > 0);
    await runtime.flushTelemetry();
    expect(delivered).toBeGreaterThan(0);
    await runtime.close();
    await timed.close();
    const posted = received.length;
    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(received).toHaveLength(posted);
    await closeServer(collector.server);
  });

  it("does not export unknown payload fields", () => {
    expect(
      allowEventPayload("STEP_COMPLETED", {
        kind: "model",
        message: SECRET_MODEL,
        input: SECRET_PROMPT,
        modelId: "scripted-1",
      }),
    ).toEqual({ kind: "model", modelId: "scripted-1" });
    expect(allowEventPayload("NOT_A_REAL_EVENT", { kind: "model" })).toBeNull();
  });

  it("keeps pending telemetry across process death and resends a lost acknowledgement", async () => {
    const received: string[] = [];
    const collector = await startCollector(async (body, response) => {
      respondJson(response, 200, ack(JSON.parse(body) as BatchBody));
    }, received);
    const directory = mkdtempSync(join(tmpdir(), "larkx-telemetry-offline-"));
    const database = join(directory, "agent.db");
    const offline = await runWorker(["offline", database, collector.url]);
    expect(offline.code).toBe(0);
    expect(received).toHaveLength(0);
    const resumed = await runWorker(["resume", database, collector.url]);
    expect(resumed.code).toBe(0);
    expect(received.length).toBeGreaterThan(0);
    expect(received.join("\n")).not.toContain(SECRET_PROMPT);
    expect(received.join("\n")).not.toContain(SECRET_MODEL);
    expect(eventsOf(received[0] ?? "").some((event) => event.type === "WORKFLOW_COMPLETED")).toBe(
      true,
    );

    const killed = await runWorker(["before-send", join(directory, "before.db"), collector.url]);
    expect(killed.signal).toBe("SIGKILL");
    const beforeCount = received.length;
    const afterBefore = await runWorker(["resume", join(directory, "before.db"), collector.url]);
    expect(afterBefore.code).toBe(0);
    expect(received.length).toBeGreaterThan(beforeCount);

    const duringReceived: string[] = [];
    let holdDuring = true;
    const duringCollector = await startCollector(async (body, response) => {
      if (holdDuring) {
        await new Promise(() => undefined);
      }
      respondJson(response, 200, ack(JSON.parse(body) as BatchBody));
    }, duringReceived);
    const duringDb = join(directory, "during.db");
    const duringChild = spawnWorker(["during-send", duringDb, duringCollector.url]);
    await waitFor(() => duringReceived.length > 0);
    const duringBody = duringReceived[0] ?? "";
    duringChild.kill("SIGKILL");
    const duringExit = await exited(duringChild);
    expect(duringExit.signal).toBe("SIGKILL");
    holdDuring = false;
    const duringResume = await runWorker(["resume", duringDb, duringCollector.url]);
    expect(duringResume.code).toBe(0);
    expect(duringReceived.length).toBeGreaterThan(1);
    expect(batchId(duringReceived[1] ?? "")).toBe(batchId(duringBody));
    expect(eventsOf(duringReceived[1] ?? "")[0]?.eventId).toBe(eventsOf(duringBody)[0]?.eventId);
    duringCollector.server.closeAllConnections?.();
    await closeServer(duringCollector.server);

    const ackDb = join(directory, "ack.db");
    const ackExit = await runWorker(["after-ack", ackDb, collector.url]);
    expect(ackExit.signal).toBe("SIGKILL");
    const ackBody = received[received.length - 1] ?? "";
    const ackCount = received.length;
    const ackResume = await runWorker(["resume", ackDb, collector.url]);
    expect(ackResume.code).toBe(0);
    expect(batchId(received[ackCount] ?? "")).toBe(batchId(ackBody));

    const cursorDb = join(directory, "cursor.db");
    const cursorExit = await runWorker(["after-cursor", cursorDb, collector.url]);
    expect(cursorExit.signal).toBe("SIGKILL");
    const cursorCount = received.length;
    const cursorResume = await runWorker(["resume", cursorDb, collector.url]);
    expect(cursorResume.code).toBe(0);
    expect(received).toHaveLength(cursorCount);
    await closeServer(collector.server);
  }, 60_000);

  it("records an inferred interruption after the process is killed", async () => {
    const received: string[] = [];
    const collector = await startCollector(async (body, response) => {
      respondJson(response, 200, ack(JSON.parse(body) as BatchBody));
    }, received);
    const directory = mkdtempSync(join(tmpdir(), "larkx-telemetry-interrupt-"));
    const database = join(directory, "agent.db");
    const flag = join(directory, "flag");
    const child = spawnWorker(["hold-tool", database, collector.url, "", flag]);
    await waitFor(() => {
      try {
        return readFileSync(flag, "utf8") === "in-tool";
      } catch {
        return false;
      }
    });
    child.kill("SIGKILL");
    expect((await exited(child)).signal).toBe("SIGKILL");
    const resumed = await runWorker(["resume", database, collector.url]);
    expect(resumed.code).toBe(0);
    const printed = JSON.parse(resumed.stdout) as { types: string[] };
    expect(printed.types).toContain("WORKFLOW_RECOVERED");
    const recovered = eventsOf(received.join("\n")).find(
      (event) => event.type === "WORKFLOW_RECOVERED",
    );
    expect(recovered?.payload.from).toBe("interrupted");
    expect(received.join("\n")).not.toContain(SECRET_PROMPT);
    await closeServer(collector.server);
  }, 30_000);

  it("observes a real LangGraph task across local process recovery", async () => {
    const direct = await runProcurement("Mechanical seal for pump model P-104");
    expect(direct.answer).toContain("Example Industrial Supply");
    const port = await freePort();
    const endpoint = `http://127.0.0.1:${String(port)}`;
    const langEnv: NodeJS.ProcessEnv = {
      ...process.env,
      PORT: String(port),
      PUBLIC_URL: endpoint,
      LARKX_LANGGRAPH_HOLD: "1",
    };
    delete langEnv.LARKX_LANGGRAPH_MODEL;
    delete langEnv.OPENAI_API_KEY;
    const child = spawn(process.execPath, [langGraphServer], {
      env: langEnv,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const received: string[] = [];
    const collector = await startCollector(async (body, response) => {
      respondJson(response, 200, ack(JSON.parse(body) as BatchBody));
    }, received);
    const directory = mkdtempSync(join(tmpdir(), "larkx-telemetry-langgraph-"));
    const database = join(directory, "agent.db");
    const flag = join(directory, "flag");
    try {
      await waitForReady(endpoint, child);
      const held = spawnWorker(["langgraph-hold", database, collector.url, endpoint, flag]);
      await waitFor(() => {
        try {
          return readFileSync(flag, "utf8") === "waiting";
        } catch {
          return false;
        }
      });
      held.kill("SIGKILL");
      expect((await exited(held)).signal).toBe("SIGKILL");
      const release = await fetch(`${endpoint}/_release`, { method: "POST", body: "{}" });
      expect(release.ok).toBe(true);
      const resumed = await runWorker(["langgraph-resume", database, collector.url, endpoint]);
      expect(resumed.code, resumed.stderr).toBe(0);
      const printed = JSON.parse(resumed.stdout) as { message: string; types: string[] };
      expect(printed.message).toContain("Example Industrial Supply");
      expect(printed.types).toContain("WORKFLOW_RECOVERED");
      const events = received.flatMap((item) => eventsOf(item));
      expect(
        events.some((event) => event.type === "STEP_COMPLETED" && event.payload.kind === "tool"),
      ).toBe(true);
      expect(
        events.some(
          (event) => event.type === "REMOTE_DISPATCH_ACCEPTED" && event.payload.transport === "a2a",
        ),
      ).toBe(true);
      const taskIds = events
        .filter((event) => event.type === "REMOTE_DISPATCH_ACCEPTED")
        .map((event) => event.payload.taskId);
      expect(new Set(taskIds).size).toBe(1);
      expect(events.some((event) => event.type === "WORKFLOW_COMPLETED")).toBe(true);
      expect(received.join("\n")).not.toContain(SECRET_PROMPT);
      expect(received.join("\n")).not.toContain("mechanical seal");
      expect(received.join("\n")).not.toContain("Example Industrial Supply");
      const inspection = (await (await fetch(`${endpoint}/_inspection`)).json()) as {
        executions: { taskId: string; graph: string }[];
      };
      expect(inspection.executions).toHaveLength(1);
      expect(inspection.executions[0]?.graph).toBe("langgraph");
      expect(inspection.executions[0]?.taskId).toBe(taskIds[0]);
    } finally {
      child.kill("SIGTERM");
      await exited(child);
      await closeServer(collector.server);
    }
  }, 60_000);
});

interface BatchBody {
  readonly telemetryVersion: number;
  readonly storageSchemaVersion: number;
  readonly mode: string;
  readonly batchId: string;
  readonly source: { readonly appId: string };
  readonly runs: readonly {
    readonly runId: string;
    readonly fromSequence: number;
    readonly throughSequence: number;
    readonly events: readonly ExportedEvent[];
  }[];
}

interface ExportedEvent {
  readonly eventId: string;
  readonly type: string;
  readonly sequence: number;
  readonly payload: { readonly [key: string]: string | number | boolean | null };
}

function eventsOf(body: string): ExportedEvent[] {
  const events: ExportedEvent[] = [];
  for (const chunk of body.split("\n")) {
    if (!chunk.includes('"events"')) {
      continue;
    }
    const parsed = JSON.parse(chunk) as BatchBody;
    for (const run of parsed.runs) {
      events.push(...run.events);
    }
  }
  return events;
}

function batchId(body: string): string {
  return (JSON.parse(body) as BatchBody).batchId;
}

function ack(batch: BatchBody): unknown {
  const run = batch.runs[0];
  return {
    telemetryVersion: 1,
    batchId: batch.batchId,
    results: [
      {
        runId: run?.runId,
        status: "accepted",
        acceptedThroughSequence: run?.throughSequence ?? 0,
      },
    ],
  };
}

async function startCollector(
  respond: (body: string, response: ServerResponse) => Promise<void>,
  received: string[],
): Promise<{ readonly server: Server; readonly url: string }> {
  const server = createServer((request, response) => {
    void readBody(request).then(async (body) => {
      received.push(body);
      await respond(body, response);
    });
  });
  const port = await listen(server);
  return { server, url: `http://127.0.0.1:${String(port)}` };
}

function listen(server: Server): Promise<number> {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (address === null || typeof address === "string") {
        reject(new Error("Collector did not bind."));
        return;
      }
      resolve(address.port);
    });
  });
}

function respondJson(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(body));
}

function readBody(request: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer) => chunks.push(chunk));
    request.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    request.on("error", reject);
  });
}

function closeServer(server: Server): Promise<void> {
  return new Promise((resolve) => {
    server.close(() => resolve());
  });
}

function spawnWorker(args: readonly string[]): ChildProcess {
  return spawn(process.execPath, [workerPath, ...args], {
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function runWorker(
  args: readonly string[],
): Promise<{ code: number | null; signal: NodeJS.Signals | null; stdout: string; stderr: string }> {
  const child = spawnWorker(args);
  return exited(child);
}

function exited(
  child: ChildProcess,
): Promise<{ code: number | null; signal: NodeJS.Signals | null; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    let stdout = "";
    let stderr = "";
    child.stdout?.setEncoding("utf8");
    child.stderr?.setEncoding("utf8");
    child.stdout?.on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.stderr?.on("data", (chunk: string) => {
      stderr += chunk;
    });
    child.once("error", reject);
    child.once("close", (code, signal) => {
      resolve({ code, signal, stdout, stderr });
    });
  });
}

async function waitFor(predicate: () => boolean): Promise<void> {
  const started = Date.now();
  while (!predicate()) {
    if (Date.now() - started > 20_000) {
      throw new Error("Timed out waiting for the telemetry worker.");
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

async function waitForReady(endpoint: string, child: ChildProcess): Promise<void> {
  const started = Date.now();
  while (Date.now() - started < 10_000) {
    try {
      const response = await fetch(`${endpoint}/_inspection`);
      if (response.ok) {
        return;
      }
    } catch {
      // The server is still binding.
    }
    if (child.exitCode !== null) {
      throw new Error("LangGraph server exited.");
    }
    await new Promise((resolve) => setTimeout(resolve, 30));
  }
  throw new Error("LangGraph server did not start.");
}

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close(() => {
        if (address === null || typeof address === "string") {
          reject(new Error("No port."));
          return;
        }
        resolve(address.port);
      });
    });
  });
}
