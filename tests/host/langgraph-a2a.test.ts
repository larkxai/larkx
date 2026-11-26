import { spawn, type ChildProcess } from "node:child_process";
import { createServer } from "node:net";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { createRuntime, remoteAgent, scriptedModel, sqlite } from "@larkxai/node";
import { describe, expect, it } from "vitest";

import { runProcurement } from "../../examples/langgraph-a2a-agent/src/graph.js";

const serverPath = fileURLToPath(
  new URL("../../examples/langgraph-a2a-agent/dist/server.js", import.meta.url),
);
const hybridPath = fileURLToPath(
  new URL("../../examples/node-hybrid/dist/main.js", import.meta.url),
);

describe("LangGraph A2A interoperability", () => {
  it("runs the LangGraph graph before the server is involved", async () => {
    const direct = await runProcurement("Mechanical seal for pump model P-104");
    expect(direct.needsInput).toBe(false);
    expect(direct.answer).toContain("Example Industrial Supply");
    expect(direct.answer).toContain("simulated=true");
    const question = await runProcurement("Mechanical seal for an unnamed pump");
    expect(question.needsInput).toBe(true);
  });

  it("delegates through A2A, continues the same task, and finishes locally", async () => {
    const port = await freePort();
    const child = spawn(process.execPath, [serverPath], {
      env: { ...process.env, PORT: String(port), PUBLIC_URL: `http://127.0.0.1:${String(port)}` },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stderr = "";
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });
    const endpoint = `http://127.0.0.1:${String(port)}`;
    try {
      await waitForReady(endpoint, child, () => stderr);
      const card = (await (await fetch(`${endpoint}/.well-known/agent-card.json`)).json()) as {
        supportedInterfaces?: readonly { url?: string; protocolVersion?: string }[];
      };
      expect(card.supportedInterfaces?.[0]).toMatchObject({
        url: endpoint,
        protocolVersion: "1.0",
      });
      const directory = mkdtempSync(join(tmpdir(), "larkx-langgraph-"));
      const runtime = await createRuntime({
        storage: sqlite(join(directory, "agent.db")),
        ownerId: "field-assistant",
        leaseMs: 0,
      });
      let active: { provideInput(text: string): Promise<void> } | null = null;
      runtime.observe((event) => {
        if (event.type === "remote-input-required" && active !== null) {
          void active.provideInput("Model P-104");
        }
      });
      const agent = runtime.createAgent({
        name: "field-assistant",
        version: 1,
        model: scriptedModel([
          {
            message: null,
            finish: "tool_calls",
            calls: [
              {
                id: "remote-1",
                name: "procurement-agent",
                arguments: { component: "mechanical seal", equipment: "pump" },
              },
            ],
          },
          { message: "Saved the simulated supplier recommendation.", finish: "stop", calls: [] },
        ]),
        instructions: "Inspect equipment and identify replacement parts.",
        remoteAgents: [
          remoteAgent({
            name: "procurement-agent",
            description: "Find compatible replacement parts and suppliers.",
            transport: { type: "a2a", endpoint, discover: true, pollIntervalMs: 50 },
          }),
        ],
      });
      const run = await agent.start({ message: "Inspect pump P-104." });
      active = run;
      await run.provideInput("Model P-104");
      const result = await run.result();
      expect(result.message).toContain("simulated supplier");
      const delegations = await run.getDelegations();
      expect(delegations[0]?.state).toBe("COMPLETED");
      expect(delegations[0]?.transport).toBe("a2a");
      expect(delegations[0]?.taskId).toMatch(/^.{1,128}$/);
      expect(delegations[0]?.contextId).toBeTruthy();
      const inspection = (await (await fetch(`${endpoint}/_inspection`)).json()) as {
        executions: readonly { taskId: string; graph: string }[];
      };
      expect(inspection.executions.every((item) => item.graph === "langgraph")).toBe(true);
      expect(new Set(inspection.executions.map((item) => item.taskId)).size).toBe(1);
      expect(inspection.executions.length).toBeGreaterThanOrEqual(2);
      await runtime.close();
    } finally {
      child.kill("SIGTERM");
      await new Promise((resolve) => child.once("close", resolve));
    }
  }, 60_000);

  it("recovers the parent after SIGKILL and consumes the same LangGraph task", async () => {
    const port = await freePort();
    const endpoint = `http://127.0.0.1:${String(port)}`;
    const child = startLangGraph(port, true);
    const directory = mkdtempSync(join(tmpdir(), "larkx-langgraph-kill-"));
    const database = join(directory, "agent.db");
    const log = join(directory, "calls.log");
    try {
      await waitForReady(endpoint, child, () => stderrOf(child));
      const killed = await runHybrid(endpoint, database, log, ["--crash-during", "after-accept"]);
      expect(killed.signal).toBe("SIGKILL");
      const held = await inspection(endpoint);
      expect(held.phase).toBe("holding");
      expect(held.taskStore).toBe("InMemoryTaskStore");
      expect(held.executions).toHaveLength(1);
      const release = await fetch(`${endpoint}/_release`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      });
      expect(release.ok).toBe(true);
      const finished = await waitForPhase(endpoint, "completed");
      expect(finished.executions).toHaveLength(1);
      expect(new Set(finished.executions.map((item) => item.taskId)).size).toBe(1);
      const resumed = await runHybrid(endpoint, database, log, ["--resume"]);
      expect(resumed.code, resumed.stdout).toBe(0);
      const body = JSON.parse(resumed.stdout) as {
        status: string;
        taskId?: string;
        message?: string;
      };
      expect(body.status).toBe("COMPLETED");
      expect(body.taskId).toBe(finished.executions[0]?.taskId);
      expect(body.message).toContain("Example Industrial Supply");
      const after = await inspection(endpoint);
      expect(after.executions).toHaveLength(1);
      expect(after.executions[0]?.graph).toBe("langgraph");
      expect(child.exitCode).toBeNull();
    } finally {
      child.kill("SIGTERM");
      await new Promise((resolve) => child.once("close", resolve));
    }
  }, 60_000);

  it("does not publish a completed LangGraph result after cancellation", async () => {
    const port = await freePort();
    const endpoint = `http://127.0.0.1:${String(port)}`;
    const child = startLangGraph(port, true);
    try {
      await waitForReady(endpoint, child, () => stderrOf(child));
      const accepted = await rpc(endpoint, "cancel-1", "SendMessage", {
        configuration: { returnImmediately: true },
        message: {
          messageId: "cancel-1",
          role: "ROLE_USER",
          parts: [{ text: "Mechanical seal for pump model P-104" }],
        },
      });
      const taskId = taskIdOf(accepted);
      expect(taskId).toMatch(/^.{1,128}$/);
      await waitForPhase(endpoint, "holding");
      const canceled = await rpc(endpoint, "cancel-2", "CancelTask", { id: taskId });
      expect(stateOf(canceled)).toBe("TASK_STATE_CANCELED");
      const release = await fetch(`${endpoint}/_release`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      });
      expect(release.ok).toBe(true);
      await new Promise((resolve) => setTimeout(resolve, 200));
      const current = await rpc(endpoint, "get-1", "GetTask", { id: taskId });
      expect(stateOf(current)).toBe("TASK_STATE_CANCELED");
      const seen = await inspection(endpoint);
      expect(seen.phase).toBe("canceled");
      expect(seen.executions).toHaveLength(1);
      expect(seen.executions[0]?.taskId).toBe(taskId);
    } finally {
      child.kill("SIGTERM");
      await new Promise((resolve) => child.once("close", resolve));
    }
  }, 30_000);
});

async function waitForReady(
  endpoint: string,
  child: { exitCode: number | null },
  stderr: () => string,
): Promise<void> {
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
      throw new Error(stderr() || "LangGraph A2A server exited.");
    }
    await new Promise((resolve) => setTimeout(resolve, 30));
  }
  throw new Error(stderr() || "LangGraph A2A server did not start.");
}

interface Inspection {
  readonly phase: string;
  readonly taskStore: string;
  readonly executions: readonly { taskId: string; graph: string }[];
}

const serverErrors = new WeakMap<ChildProcess, string>();

function startLangGraph(port: number, hold: boolean): ChildProcess {
  const endpoint = `http://127.0.0.1:${String(port)}`;
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    PORT: String(port),
    PUBLIC_URL: endpoint,
  };
  if (hold) {
    env.LARKX_LANGGRAPH_HOLD = "1";
  }
  delete env.LARKX_LANGGRAPH_MODEL;
  delete env.OPENAI_API_KEY;
  const child = spawn(process.execPath, [serverPath], {
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stderr = "";
  child.stderr?.setEncoding("utf8");
  child.stderr?.on("data", (chunk: string) => {
    stderr += chunk;
    serverErrors.set(child, stderr);
  });
  return child;
}

function stderrOf(child: ChildProcess): string {
  return serverErrors.get(child) ?? "";
}

async function inspection(endpoint: string): Promise<Inspection> {
  const response = await fetch(`${endpoint}/_inspection`);
  if (!response.ok) {
    throw new Error(`Inspection returned HTTP ${String(response.status)}.`);
  }
  return (await response.json()) as Inspection;
}

async function waitForPhase(endpoint: string, phase: string): Promise<Inspection> {
  const started = Date.now();
  let latest = "";
  while (Date.now() - started < 10_000) {
    const body = await inspection(endpoint);
    latest = body.phase;
    if (body.phase === phase) {
      return body;
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error(`LangGraph phase stayed ${latest}.`);
}

async function rpc(
  endpoint: string,
  id: string,
  method: string,
  params: unknown,
): Promise<{ readonly result?: unknown; readonly error?: unknown }> {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json", "a2a-version": "1.0" },
    body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
  });
  const body = (await response.json()) as { readonly result?: unknown; readonly error?: unknown };
  if (!response.ok || body.error !== undefined) {
    throw new Error(`A2A ${method} failed: ${JSON.stringify(body.error ?? response.status)}`);
  }
  return body;
}

function taskIdOf(body: { readonly result?: unknown }): string {
  const result = record(body.result);
  const task = record(result.task ?? result);
  return typeof task.id === "string" ? task.id : "";
}

function stateOf(body: { readonly result?: unknown }): string {
  const result = record(body.result);
  const task = record(result.task ?? result);
  const status = record(task.status);
  return typeof status.state === "string" ? status.state : "";
}

function record(value: unknown): { readonly [key: string]: unknown } {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as { readonly [key: string]: unknown })
    : {};
}

function runHybrid(
  endpoint: string,
  database: string,
  log: string,
  args: readonly string[],
): Promise<{ code: number | null; signal: NodeJS.Signals | null; stdout: string }> {
  const child = spawn(
    process.execPath,
    [
      hybridPath,
      "--database",
      database,
      "--log",
      log,
      "--endpoint",
      endpoint,
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
  return new Promise((resolve, reject) => {
    child.on("error", reject);
    child.on("close", (code, signal) => {
      if (code !== 0 && code !== 2 && signal === null) {
        reject(new Error(stderr || stdout || `exit ${String(code)}`));
        return;
      }
      resolve({ code, signal, stdout });
    });
  });
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
