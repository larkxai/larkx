import { spawn, type ChildProcess } from "node:child_process";
import { createServer as createHttpServer, type Server } from "node:http";
import { createServer } from "node:net";
import { once } from "node:events";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  createRuntime,
  defineTool,
  remoteAgent,
  scriptedModel,
  sqlite,
  type RemoteCapabilities,
  type Runtime,
  type Run,
} from "@larkxai/node";
import { describe, expect, it } from "vitest";

const example = fileURLToPath(new URL("../../examples/node-hybrid/dist/main.js", import.meta.url));
const fixture = fileURLToPath(new URL("../../examples/remote-task/dist/main.js", import.meta.url));
const NOTES = "Do not send this sentence to the remote agent.";

describe("durable remote delegation", () => {
  it("delegates, commits the remote result, and continues locally", async () => {
    const directory = mkdtempSync(join(tmpdir(), "larkx-remote-"));
    const server = await startServer(directory, 0);
    const database = join(directory, "agent.db");
    const log = join(directory, "calls.log");
    const finished = await runExample(server, database, log, []);
    expect(finished.code).toBe(0);
    const body = JSON.parse(finished.stdout) as {
      message: string;
      operationId: string;
      taskId: string;
    };
    expect(body.message).toMatch(/Example Industrial Supply/);
    expect(body.taskId).toMatch(/^task-/);
    const tasks = await snapshot(server);
    expect(tasks.created).toBe(1);
    expect(tasks.posts).toBe(1);
    expect(JSON.stringify(tasks.tasks[0]?.input)).not.toContain(NOTES);
    expect(JSON.stringify(tasks.tasks[0]?.input)).toContain("Mechanical seal");
    expect(readFileSync(database, "utf8")).not.toContain("secret-token");
    await server.stop();
  });

  it("keeps one remote task when the process dies around submission and polling", async () => {
    const points = [
      "before-submit",
      "after-submit",
      "after-accept",
      "before-commit",
      "after-commit",
    ] as const;
    for (const point of points) {
      const directory = mkdtempSync(join(tmpdir(), "larkx-remote-kill-"));
      const server = await startServer(directory, point === "before-commit" ? 0 : 30);
      if (point === "after-submit") {
        await control(server, { dropNextAck: true });
      }
      const database = join(directory, "agent.db");
      const log = join(directory, "calls.log");
      const killed = await runExample(server, database, log, ["--crash-during", point]);
      expect(killed.signal).toBe("SIGKILL");
      const resumed = await runExample(server, database, log, ["--resume"]);
      expect(resumed.code).toBe(0);
      const tasks = await snapshot(server);
      expect(tasks.created).toBe(1);
      expect(tasks.posts).toBe(1);
      expect(readLines(log).filter((line) => line === "remote-requested submit")).toHaveLength(
        point === "before-submit" ? 2 : 1,
      );
      expect(readLines(log).filter((line) => line === "save_report")).toEqual(["save_report"]);
      await server.stop();
    }
  }, 90_000);

  it("polls the accepted task after the local process is killed during a poll", async () => {
    const directory = mkdtempSync(join(tmpdir(), "larkx-remote-poll-"));
    const server = await startServer(directory, 1_500);
    const database = join(directory, "agent.db");
    const log = join(directory, "calls.log");
    const child = spawnExample(server, database, log, ["--crash-during", "during-poll"]);
    await waitForLine(log, "poll-open");
    child.kill("SIGKILL");
    const killed = await child.closed;
    expect(killed.signal).toBe("SIGKILL");
    const resumed = await runExample(server, database, log, ["--resume"]);
    expect(resumed.code).toBe(0);
    const tasks = await snapshot(server);
    expect(tasks.created).toBe(1);
    expect(tasks.posts).toBe(1);
    await server.stop();
  });

  it("blocks a lost acknowledgement when the adapter cannot look up or dedupe", async () => {
    const directory = mkdtempSync(join(tmpdir(), "larkx-remote-unknown-"));
    const server = await startServer(directory, 0);
    await control(server, { dropNextAck: true });
    const database = join(directory, "agent.db");
    const log = join(directory, "calls.log");
    const killed = await runExample(server, database, log, [
      "--capabilities",
      "none",
      "--crash-during",
      "after-submit",
    ]);
    expect(killed.signal).toBe("SIGKILL");
    const blocked = await runExample(server, database, log, ["--resume", "--capabilities", "none"]);
    expect(blocked.code).toBe(2);
    expect(JSON.parse(blocked.stdout).status).toBe("BLOCKED");
    const tasks = await snapshot(server);
    expect(tasks.created).toBe(1);
    expect(tasks.posts).toBe(1);
    const reconciled = await runExample(server, database, log, [
      "--resume",
      "--capabilities",
      "none",
      "--reconcile",
      "complete",
    ]);
    expect(reconciled.code).toBe(0);
    expect(await snapshot(server)).toMatchObject({ created: 1, posts: 1 });
    await server.stop();
  });

  it("queues while offline and submits the same operation after restart", async () => {
    const directory = mkdtempSync(join(tmpdir(), "larkx-remote-offline-"));
    const server = await startServer(directory, 0);
    const database = join(directory, "agent.db");
    const log = join(directory, "calls.log");
    const child = spawnExample(server, database, log, ["--offline"]);
    await waitForLine(log, "remote-waiting network");
    child.kill("SIGKILL");
    await child.closed;
    const resumed = await runExample(server, database, log, ["--resume"]);
    expect(resumed.code).toBe(0);
    const tasks = await snapshot(server);
    expect(tasks.created).toBe(1);
    const first = JSON.parse(readLines(log).find((line) => line.startsWith("{")) ?? "{}") as {
      operationId?: string;
    };
    expect(JSON.parse(resumed.stdout).operationId).toBeDefined();
    expect(tasks.tasks[0]?.operationId).toBe(JSON.parse(resumed.stdout).operationId);
    expect(first).toBeDefined();
    await server.stop();
  });

  it("does not persist credentials and sends only the remote arguments", async () => {
    const directory = mkdtempSync(join(tmpdir(), "larkx-remote-authz-"));
    const server = await startServer(directory, 0);
    const database = join(directory, "agent.db");
    const log = join(directory, "calls.log");
    const finished = await runExample(server, database, log, ["--token", "secret-token"]);
    expect(finished.code).toBe(0);
    const tasks = await snapshot(server);
    expect(tasks.sawAuthorization).toBe(true);
    const databaseText = readFileSync(database);
    const storeText = readFileSync(server.data);
    expect(databaseText.includes(Buffer.from("secret-token"))).toBe(false);
    expect(storeText.includes(Buffer.from("secret-token"))).toBe(false);
    expect(JSON.stringify(tasks.tasks[0]?.input)).not.toContain(NOTES);
    await server.stop();
  });

  it("rejects a recovered destination that is no longer registered", async () => {
    const directory = mkdtempSync(join(tmpdir(), "larkx-remote-destination-"));
    const server = await startServer(directory, 0);
    const database = join(directory, "agent.db");
    const log = join(directory, "calls.log");
    const killed = await runExample(server, database, log, ["--crash-during", "before-submit"]);
    expect(killed.signal).toBe("SIGKILL");
    const runtime = await createRuntime({
      storage: sqlite(database),
      ownerId: "field-assistant",
      leaseMs: 0,
    });
    runtime.createAgent({
      name: "field-assistant",
      version: 1,
      model: {
        id: "scripted",
        model: "scripted-field",
        capabilities: { toolCalling: true },
        async complete() {
          return { message: "no", finish: "stop" as const, calls: [] };
        },
      },
      instructions: "Inspect equipment and identify replacement parts.",
      remoteAgents: [
        remoteAgent({
          name: "procurement-agent",
          description: "Find compatible replacement parts and suppliers.",
          transport: { type: "http", endpoint: "http://127.0.0.1:9" },
        }),
      ],
    });
    const run = await runtime.resume("field-run");
    await expect(run.result()).rejects.toThrow(/not registered|not authorized/);
    expect((await snapshot(server)).posts).toBe(0);
    await runtime.close();
    await server.stop();
  });

  it("does not call the network for a local-only agent", async () => {
    const directory = mkdtempSync(join(tmpdir(), "larkx-remote-local-"));
    const server = await startServer(directory, 0);
    const runtime = await createRuntime({
      storage: sqlite(join(directory, "agent.db")),
      ownerId: "local-only",
      leaseMs: 0,
    });
    const agent = runtime.createAgent({
      name: "local-only",
      version: 1,
      model: scriptedModel([
        {
          message: null,
          finish: "tool_calls",
          calls: [
            {
              id: "remote-1",
              name: "procurement-agent",
              arguments: { objective: "Find a seal" },
            },
          ],
        },
        { message: "Staying local.", finish: "stop", calls: [] },
      ]),
      instructions: "Stay on device.",
      tools: [
        defineTool({
          name: "read_inspection_notes",
          description: "Read notes.",
          effects: "pure",
          schema: { type: "object", properties: {} },
          handler: () => ({ notes: [] }),
        }),
      ],
    });
    const run = await agent.start({ message: "Inspect pump P-104" });
    expect((await run.result()).message).toBe("Staying local.");
    expect((await snapshot(server)).posts).toBe(0);
    await runtime.close();
    await server.stop();
  });

  it("cancels a known task and records when cancellation is unsupported", async () => {
    const directory = mkdtempSync(join(tmpdir(), "larkx-remote-cancel-"));
    const server = await startServer(directory, 5_000);
    const runtime = await createRuntime({
      storage: sqlite(join(directory, "agent.db")),
      ownerId: "field-assistant",
      leaseMs: 0,
    });
    const active: { run?: Run } = {};
    runtime.holdExecution(async (event) => {
      if (
        event.type === "remote-response" &&
        event.outcome === "accepted" &&
        active.run !== undefined
      ) {
        await active.run.cancel();
      }
    });
    const agent = runtime.createAgent({
      name: "field-assistant",
      version: 1,
      model: inspectionModel(),
      instructions: "Inspect equipment and identify replacement parts.",
      tools: localTools(),
      remoteAgents: [
        remoteAgent({
          name: "procurement-agent",
          description: "Find compatible replacement parts and suppliers.",
          transport: { type: "http", endpoint: server.endpoint, pollIntervalMs: 50 },
        }),
      ],
    });
    active.run = await agent.start({ message: "Inspect pump P-104" });
    await expect(active.run.result()).rejects.toThrow(/cancelled/i);
    const tasks = await snapshot(server);
    expect(tasks.tasks[0]?.status).toBe("cancelled");
    await runtime.close();

    const unsupported = await createRuntime({
      storage: sqlite(join(directory, "unsupported.db")),
      ownerId: "field-assistant",
      leaseMs: 0,
    });
    const otherRun: { run?: Run } = {};
    unsupported.holdExecution(async (event) => {
      if (
        event.type === "remote-response" &&
        event.outcome === "accepted" &&
        otherRun.run !== undefined
      ) {
        await otherRun.run.cancel();
      }
    });
    const other = unsupported.createAgent({
      name: "field-assistant",
      version: 1,
      model: inspectionModel(),
      instructions: "Inspect equipment and identify replacement parts.",
      tools: localTools(),
      remoteAgents: [
        remoteAgent({
          name: "procurement-agent",
          description: "Find compatible replacement parts and suppliers.",
          transport: {
            type: "http",
            endpoint: server.endpoint,
            pollIntervalMs: 50,
            capabilities: { cancel: false },
          },
        }),
      ],
    });
    otherRun.run = await other.start({ message: "Inspect pump P-104" });
    await expect(otherRun.run.result()).rejects.toThrow(/cancelled/i);
    const history = await otherRun.run.getHistory();
    expect(JSON.stringify(history.events)).toMatch(/may still be active/);
    const after = await snapshot(server);
    expect(after.tasks.filter((task) => task.status === "cancelled")).toHaveLength(1);
    await unsupported.close();
    await server.stop();
  });

  it("fails the parent when the remote task fails and rejects a conflicting payload", async () => {
    const directory = mkdtempSync(join(tmpdir(), "larkx-remote-fail-"));
    const server = await startServer(directory, 0);
    await control(server, { failNext: true });
    const runtime = await createRuntime({
      storage: sqlite(join(directory, "agent.db")),
      ownerId: "field-assistant",
      leaseMs: 0,
    });
    const agent = runtime.createAgent({
      name: "field-assistant",
      version: 1,
      model: inspectionModel(),
      instructions: "Inspect equipment and identify replacement parts.",
      tools: localTools(),
      remoteAgents: [
        remoteAgent({
          name: "procurement-agent",
          description: "Find compatible replacement parts and suppliers.",
          transport: { type: "http", endpoint: server.endpoint, pollIntervalMs: 50 },
        }),
      ],
    });
    const run = await agent.start({ message: "Inspect pump P-104" });
    await expect(run.result()).rejects.toThrow(/Simulated supplier search failure/);
    await runtime.close();
    const conflict = await fetch(`${server.endpoint}/tasks`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ operationId: "op-conflict", input: { component: "seal" } }),
    });
    expect(conflict.status).toBe(202);
    const again = await fetch(`${server.endpoint}/tasks`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ operationId: "op-conflict", input: { component: "bearing" } }),
    });
    expect(again.status).toBe(409);
    await server.stop();
  });

  it("recovers the original task after a lost acknowledgement and an offline lookup", async () => {
    const directory = mkdtempSync(join(tmpdir(), "larkx-remote-ack-"));
    const server = await startServer(directory, 0);
    await control(server, { dropNextAck: true });
    const database = join(directory, "agent.db");
    let online = true;
    let sawOfflineLookup = false;
    let releaseParked: () => void = () => undefined;
    const parked = new Promise<void>((resolve) => {
      releaseParked = resolve;
    });
    const runtime = await createRuntime({
      storage: sqlite(database),
      ownerId: "field-assistant",
      leaseMs: 0,
      isOnline: () => online,
    });
    runtime.holdExecution((event) => {
      if (event.type === "remote-response" && event.action === "submit") {
        online = false;
      }
      if (
        event.type === "remote-response" &&
        event.action === "lookup" &&
        event.outcome === "offline"
      ) {
        sawOfflineLookup = true;
      }
      if (event.type === "remote-waiting" && event.waitingFor === "network" && sawOfflineLookup) {
        releaseParked();
      }
    });
    const agent = runtime.createAgent({
      name: "field-assistant",
      version: 1,
      model: inspectionModel(),
      instructions: "Inspect equipment and identify replacement parts.",
      tools: localTools(),
      remoteAgents: [procurement(server.endpoint, lookupOnly)],
    });
    const run = await agent.start({ message: "Inspect pump P-104" });
    const pending = run.result().then(
      () => undefined,
      () => undefined,
    );
    await parked;
    const before = await run.getDelegations();
    expect(before[0]?.state).toBe("SUBMITTING");
    expect(before[0]?.taskId).toBeNull();
    const operationId = before[0]?.operationId;
    const stored = await snapshot(server);
    expect(stored.posts).toBe(1);
    expect(stored.created).toBe(1);
    expect(stored.tasks[0]?.operationId).toBe(operationId);
    const taskId = stored.tasks[0]?.taskId;
    await runtime.close();
    await pending;

    const resumed = await createRuntime({
      storage: sqlite(database),
      ownerId: "field-assistant",
      leaseMs: 0,
      isOnline: () => true,
    });
    resumed.createAgent({
      name: "field-assistant",
      version: 1,
      model: inspectionModel(),
      instructions: "Inspect equipment and identify replacement parts.",
      tools: localTools(),
      remoteAgents: [procurement(server.endpoint, lookupOnly)],
    });
    const continued = await resumed.resume(run.runId);
    expect((await continued.result()).message).toBe("Done.");
    const after = await continued.getDelegations();
    expect(after[0]?.state).toBe("COMPLETED");
    expect(after[0]?.operationId).toBe(operationId);
    expect(after[0]?.taskId).toBe(taskId);
    expect(await snapshot(server)).toMatchObject({ posts: 1, created: 1 });
    await resumed.close();
    await server.stop();
  });

  it("does not resubmit a lost acknowledgement when dedupe and lookup are omitted", async () => {
    const directory = mkdtempSync(join(tmpdir(), "larkx-remote-omit-"));
    const server = await startServer(directory, 0);
    await control(server, { dropNextAck: true });
    const database = join(directory, "agent.db");
    const runtime = await createRuntime({
      storage: sqlite(database),
      ownerId: "field-assistant",
      leaseMs: 0,
    });
    const blocked = waitForReconcile(runtime);
    const agent = runtime.createAgent({
      name: "field-assistant",
      version: 1,
      model: inspectionModel(),
      instructions: "Inspect equipment and identify replacement parts.",
      tools: localTools(),
      remoteAgents: [procurement(server.endpoint)],
    });
    const run = await agent.start({ message: "Inspect pump P-104" });
    const pending = run.result().then(
      () => undefined,
      () => undefined,
    );
    await blocked;
    const before = await run.getDelegations();
    expect(before[0]?.state).toBe("UNKNOWN_OUTCOME");
    const operationId = before[0]?.operationId;
    expect((await snapshot(server)).posts).toBe(1);
    await runtime.close();
    await pending;

    const resumed = await createRuntime({
      storage: sqlite(database),
      ownerId: "field-assistant",
      leaseMs: 0,
    });
    const blockedAgain = waitForReconcile(resumed);
    resumed.createAgent({
      name: "field-assistant",
      version: 1,
      model: inspectionModel(),
      instructions: "Inspect equipment and identify replacement parts.",
      tools: localTools(),
      remoteAgents: [procurement(server.endpoint)],
    });
    const continued = await resumed.resume(run.runId);
    const still = continued.result().then(
      () => undefined,
      () => undefined,
    );
    await blockedAgain;
    const after = await continued.getDelegations();
    expect(after[0]?.state).toBe("UNKNOWN_OUTCOME");
    expect(after[0]?.operationId).toBe(operationId);
    expect(await snapshot(server)).toMatchObject({ posts: 1, created: 1 });
    await resumed.close();
    await still;
    await server.stop();
  });

  it("rejects recovery at an endpoint that was not registered for the task", async () => {
    const directory = mkdtempSync(join(tmpdir(), "larkx-remote-moved-"));
    const server = await startServer(directory, 0);
    const database = join(directory, "agent.db");
    const hits: string[] = [];
    const moved = createMovedServer(hits);
    const movedPort = await listen(moved);
    let releaseAccepted: () => void = () => undefined;
    const accepted = new Promise<void>((resolve) => {
      releaseAccepted = resolve;
    });
    const runtime = await createRuntime({
      storage: sqlite(database),
      ownerId: "field-assistant",
      leaseMs: 0,
    });
    runtime.holdExecution(async (event) => {
      if (event.type === "remote-requested" && event.action === "poll") {
        releaseAccepted();
        await runtime.close();
      }
    });
    const agent = runtime.createAgent({
      name: "field-assistant",
      version: 1,
      model: inspectionModel(),
      instructions: "Inspect equipment and identify replacement parts.",
      tools: localTools(),
      remoteAgents: [procurement(server.endpoint, referenceCapabilities)],
    });
    const run = await agent.start({ message: "Inspect pump P-104" });
    const pending = run.result().then(
      () => undefined,
      () => undefined,
    );
    await accepted;
    await pending;
    expect((await snapshot(server)).posts).toBe(1);

    const resumed = await createRuntime({
      storage: sqlite(database),
      ownerId: "field-assistant",
      leaseMs: 0,
    });
    resumed.createAgent({
      name: "field-assistant",
      version: 1,
      model: inspectionModel(),
      instructions: "Inspect equipment and identify replacement parts.",
      tools: localTools(),
      remoteAgents: [procurement(`http://127.0.0.1:${String(movedPort)}`, referenceCapabilities)],
    });
    const continued = await resumed.resume(run.runId);
    await expect(continued.result()).rejects.toThrow(/not registered|not authorized/);
    expect(hits).toEqual([]);
    expect(await snapshot(server)).toMatchObject({ posts: 1, created: 1 });
    await resumed.close();
    await closeServer(moved);
    await server.stop();
  });
});

const referenceCapabilities: RemoteCapabilities = {
  dedupe: true,
  lookup: true,
  taskId: true,
  poll: true,
  cancel: true,
  persistent: true,
};

const lookupOnly: RemoteCapabilities = { ...referenceCapabilities, dedupe: false };

function procurement(endpoint: string, capabilities?: RemoteCapabilities) {
  return remoteAgent({
    name: "procurement-agent",
    description: "Find compatible replacement parts and suppliers.",
    transport: {
      type: "http",
      endpoint,
      pollIntervalMs: 50,
      ...(capabilities !== undefined ? { capabilities } : {}),
    },
  });
}

function waitForReconcile(runtime: Runtime): Promise<void> {
  return new Promise((resolve) => {
    runtime.observe((event) => {
      if (event.type === "reconcile-required") {
        resolve();
      }
    });
  });
}

function createMovedServer(hits: string[]): Server {
  return createHttpServer((request, response) => {
    hits.push(
      `${request.method ?? ""} ${request.url ?? ""} ${request.headers.authorization ?? ""}`,
    );
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ taskId: "task-moved", status: "accepted" }));
  });
}

async function listen(server: Server): Promise<number> {
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (address === null || typeof address === "string") {
    throw new Error("The recovery server did not bind a port.");
  }
  return address.port;
}

function closeServer(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error) => {
      if (error !== undefined) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

function inspectionModel() {
  let invocations = 0;
  return {
    id: "scripted",
    model: "scripted-field",
    capabilities: { toolCalling: true },
    async complete(request: { readonly messages: readonly unknown[] }) {
      invocations += 1;
      const called = JSON.stringify(request.messages);
      if (called.includes("procurement-agent")) {
        return { message: "Done.", finish: "stop" as const, calls: [] };
      }
      if (invocations > 4) {
        throw new Error("The remote call was repeated.");
      }
      return {
        message: null,
        finish: "tool_calls" as const,
        calls: [
          {
            id: "remote-1",
            name: "procurement-agent",
            arguments: {
              objective: "Find a seal",
              equipment: "Industrial water pump",
              component: "Mechanical seal",
            },
          },
        ],
      };
    },
  };
}

function localTools() {
  return [
    defineTool({
      name: "read_inspection_notes",
      description: "Read notes.",
      effects: "pure" as const,
      schema: { type: "object" as const, properties: {} },
      handler: () => ({ notes: [NOTES] }),
    }),
  ];
}

interface Fixture {
  readonly endpoint: string;
  readonly data: string;
  stop(): Promise<void>;
}

interface TaskSnapshot {
  readonly posts: number;
  readonly created: number;
  readonly sawAuthorization: boolean;
  readonly tasks: readonly {
    readonly taskId: string;
    readonly operationId: string;
    readonly status: string;
    readonly input: unknown;
  }[];
}

async function startServer(directory: string, delayMs: number): Promise<Fixture> {
  const port = await freePort();
  const data = join(directory, "tasks.json");
  const child = spawn(
    process.execPath,
    [fixture, "--port", String(port), "--data", data, "--delay-ms", String(delayMs)],
    {
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  let stderr = "";
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk: string) => {
    stderr += chunk;
  });
  const endpoint = `http://127.0.0.1:${String(port)}`;
  const started = Date.now();
  while (Date.now() - started < 5_000) {
    try {
      const response = await fetch(`${endpoint}/_tasks`);
      if (response.ok) {
        return {
          endpoint,
          data,
          async stop() {
            child.kill("SIGTERM");
            await new Promise((resolve) => child.once("close", resolve));
          },
        };
      }
    } catch {
      // The fixture is still binding.
    }
    if (child.exitCode !== null) {
      throw new Error(stderr || "Remote fixture exited.");
    }
    await delay(20);
  }
  child.kill("SIGTERM");
  throw new Error(stderr || "Remote fixture did not start.");
}

async function control(
  server: Fixture,
  body: { readonly dropNextAck?: boolean; readonly failNext?: boolean },
): Promise<void> {
  const response = await fetch(`${server.endpoint}/_control`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error(`Control failed with ${String(response.status)}.`);
  }
}

async function snapshot(server: Fixture): Promise<TaskSnapshot> {
  const response = await fetch(`${server.endpoint}/_tasks`);
  return (await response.json()) as TaskSnapshot;
}

function spawnExample(
  server: Fixture,
  database: string,
  log: string,
  args: readonly string[],
): ChildProcess & {
  closed: Promise<{ code: number | null; signal: NodeJS.Signals | null; stdout: string }>;
} {
  const child = spawn(
    process.execPath,
    [example, "--database", database, "--log", log, "--endpoint", server.endpoint, ...args],
    {
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  let stdout = "";
  let stderr = "";
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk: string) => {
    stdout += chunk;
  });
  child.stderr.on("data", (chunk: string) => {
    stderr += chunk;
  });
  const closed = new Promise<{
    code: number | null;
    signal: NodeJS.Signals | null;
    stdout: string;
  }>((resolve, reject) => {
    child.on("error", reject);
    child.on("close", (code, signal) => {
      if (code !== 0 && code !== 2 && signal === null) {
        reject(new Error(stderr || stdout || `exit ${String(code)}`));
        return;
      }
      resolve({ code, signal, stdout });
    });
  });
  return Object.assign(child, { closed });
}

function runExample(
  server: Fixture,
  database: string,
  log: string,
  args: readonly string[],
): Promise<{ code: number | null; signal: NodeJS.Signals | null; stdout: string }> {
  return spawnExample(server, database, log, args).closed;
}

function readLines(path: string): string[] {
  return readFileSync(path, "utf8")
    .split("\n")
    .filter((line) => line.length > 0);
}

async function waitForLine(path: string, needle: string): Promise<void> {
  const started = Date.now();
  while (Date.now() - started < 10_000) {
    try {
      if (readFileSync(path, "utf8").includes(needle)) {
        return;
      }
    } catch {
      // The log is created on the first record.
    }
    await delay(20);
  }
  throw new Error(`Timed out waiting for ${needle}.`);
}

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address !== null ? address.port : 0;
      server.close(() => resolve(port));
    });
  });
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
