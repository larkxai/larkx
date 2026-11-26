import { spawn } from "node:child_process";
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
