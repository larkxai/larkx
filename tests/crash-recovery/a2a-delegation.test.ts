import { spawn, type ChildProcess } from "node:child_process";
import { createServer } from "node:net";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const example = fileURLToPath(new URL("../../examples/node-hybrid/dist/main.js", import.meta.url));
const fixture = fileURLToPath(new URL("../../examples/a2a-fixture/dist/main.js", import.meta.url));

describe("durable A2A delegation", () => {
  it("does not send again when the process dies before the acknowledgement", async () => {
    const directory = mkdtempSync(join(tmpdir(), "larkx-a2a-before-"));
    const server = await startServer(directory, 0);
    const database = join(directory, "agent.db");
    const log = join(directory, "calls.log");
    const killed = await runExample(server, database, log, ["--crash-during", "before-submit"]);
    expect(killed.signal).toBe("SIGKILL");
    const blocked = await runExample(server, database, log, ["--resume"]);
    expect(blocked.code).toBe(2);
    expect(JSON.parse(blocked.stdout).status).toBe("BLOCKED");
    expect(await snapshot(server)).toMatchObject({ created: 0, sends: 0 });
    await server.stop();
  });

  it("recovers a known task after process death and does not create another", async () => {
    const points = ["after-accept", "after-commit"] as const;
    for (const point of points) {
      const directory = mkdtempSync(join(tmpdir(), "larkx-a2a-kill-"));
      const server = await startServer(directory, point === "after-accept" ? 40 : 0);
      const database = join(directory, "agent.db");
      const log = join(directory, "calls.log");
      const killed = await runExample(server, database, log, ["--crash-during", point]);
      expect(killed.signal).toBe("SIGKILL");
      const resumed = await runExample(server, database, log, ["--resume"]);
      expect(resumed.code, `${point} ${resumed.stdout}`).toBe(0);
      const tasks = await snapshot(server);
      expect(tasks.created).toBe(1);
      expect(tasks.sends).toBe(1);
      await server.stop();
    }
  }, 90_000);

  it("blocks when the completed result is received but not committed", async () => {
    const directory = mkdtempSync(join(tmpdir(), "larkx-a2a-commit-"));
    const server = await startServer(directory, 0);
    const database = join(directory, "agent.db");
    const log = join(directory, "calls.log");
    const killed = await runExample(server, database, log, ["--crash-during", "before-commit"]);
    expect(killed.signal).toBe("SIGKILL");
    const blocked = await runExample(server, database, log, ["--resume"]);
    expect(blocked.code).toBe(2);
    expect(JSON.parse(blocked.stdout).delegation).toBe("UNKNOWN_OUTCOME");
    expect(await snapshot(server)).toMatchObject({ created: 1, sends: 1 });
    await server.stop();
  });

  it("blocks a lost acknowledgement instead of sending another message", async () => {
    const directory = mkdtempSync(join(tmpdir(), "larkx-a2a-unknown-"));
    const server = await startServer(directory, 0);
    await control(server, { dropSendAck: 1 });
    const database = join(directory, "agent.db");
    const log = join(directory, "calls.log");
    const killed = await runExample(server, database, log, ["--crash-during", "after-submit"]);
    expect(killed.signal).toBe("SIGKILL");
    const blocked = await runExample(server, database, log, ["--resume"]);
    expect(blocked.code).toBe(2);
    expect(JSON.parse(blocked.stdout).status).toBe("BLOCKED");
    expect(await snapshot(server)).toMatchObject({ created: 1, sends: 1 });
    await server.stop();
  });

  it("polls the same task when the process dies during a poll", async () => {
    const directory = mkdtempSync(join(tmpdir(), "larkx-a2a-poll-"));
    const server = await startServer(directory, 1_500);
    const database = join(directory, "agent.db");
    const log = join(directory, "calls.log");
    const child = spawnExample(server, database, log, ["--crash-during", "during-poll"]);
    await waitForLine(log, "poll-open");
    child.kill("SIGKILL");
    expect((await child.closed).signal).toBe("SIGKILL");
    const resumed = await runExample(server, database, log, ["--resume"]);
    expect(resumed.code).toBe(0);
    expect(await snapshot(server)).toMatchObject({ created: 1, sends: 1 });
    await server.stop();
  });

  it("queues offline and submits once after restart", async () => {
    const directory = mkdtempSync(join(tmpdir(), "larkx-a2a-offline-"));
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
    expect(tasks.sends).toBe(1);
    expect(tasks.tasks[0]?.operationId).toBe(JSON.parse(resumed.stdout).operationId);
    await server.stop();
  });

  it("continues one task when the agent asks for the model number", async () => {
    const directory = mkdtempSync(join(tmpdir(), "larkx-a2a-input-"));
    const server = await startServer(directory, 0);
    await control(server, { inputRequired: true });
    const database = join(directory, "agent.db");
    const log = join(directory, "calls.log");
    const finished = await runExample(server, database, log, ["--answer", "Model P-104"]);
    expect(finished.code).toBe(0);
    const tasks = await snapshot(server);
    expect(tasks.created).toBe(1);
    expect(tasks.sends).toBe(2);
    expect(tasks.tasks).toHaveLength(1);
    expect(tasks.tasks[0]?.input).toContain("Model P-104");
    expect(tasks.tasks[0]?.input).not.toContain("Do not send this sentence");
    await server.stop();
  });

  it("blocks a lost continuation acknowledgement on the same task", async () => {
    const directory = mkdtempSync(join(tmpdir(), "larkx-a2a-continue-"));
    const server = await startServer(directory, 0);
    await control(server, { inputRequired: true, dropSendAck: 2 });
    const database = join(directory, "agent.db");
    const log = join(directory, "calls.log");
    const killed = await runExample(server, database, log, [
      "--answer",
      "Model P-104",
      "--crash-during",
      "after-continue",
    ]);
    expect(killed.signal).toBe("SIGKILL");
    const blocked = await runExample(server, database, log, ["--resume"]);
    expect(blocked.code).toBe(2);
    expect(await snapshot(server)).toMatchObject({ created: 1, sends: 2 });
    await server.stop();
  });

  it("does not persist the bearer token", async () => {
    const directory = mkdtempSync(join(tmpdir(), "larkx-a2a-auth-"));
    const server = await startServer(directory, 0);
    const database = join(directory, "agent.db");
    const log = join(directory, "calls.log");
    const finished = await runExample(server, database, log, ["--token", "secret-token"]);
    expect(finished.code).toBe(0);
    expect((await snapshot(server)).sawAuthorization).toBe(true);
    expect(readFileSync(database).includes(Buffer.from("secret-token"))).toBe(false);
    expect(readFileSync(server.data).includes(Buffer.from("secret-token"))).toBe(false);
    await server.stop();
  });
});

interface Fixture {
  readonly endpoint: string;
  readonly data: string;
  stop(): Promise<void>;
}

interface Snapshot {
  readonly sends: number;
  readonly created: number;
  readonly sawAuthorization: boolean;
  readonly tasks: readonly {
    readonly taskId: string;
    readonly operationId: string;
    readonly input: string;
  }[];
}

async function startServer(directory: string, delayMs: number): Promise<Fixture> {
  const port = await freePort();
  const data = join(directory, "tasks.json");
  const child = spawn(
    process.execPath,
    [fixture, "--port", String(port), "--data", data, "--delay-ms", String(delayMs)],
    { stdio: ["ignore", "pipe", "pipe"] },
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
      throw new Error(stderr || "A2A fixture exited.");
    }
    await delay(20);
  }
  child.kill("SIGTERM");
  throw new Error(stderr || "A2A fixture did not start.");
}

async function control(
  server: Fixture,
  body: { readonly dropSendAck?: number; readonly inputRequired?: boolean },
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

async function snapshot(server: Fixture): Promise<Snapshot> {
  const response = await fetch(`${server.endpoint}/_tasks`);
  return (await response.json()) as Snapshot;
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
    [
      example,
      "--database",
      database,
      "--log",
      log,
      "--endpoint",
      server.endpoint,
      "--transport",
      "a2a",
      ...args,
    ],
    { stdio: ["ignore", "pipe", "pipe"] },
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
    const probe = createServer();
    probe.on("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const address = probe.address();
      const port = typeof address === "object" && address !== null ? address.port : 0;
      probe.close(() => resolve(port));
    });
  });
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
