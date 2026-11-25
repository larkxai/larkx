import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  createRuntime,
  defineTool,
  sqlite,
  type HistoryStep,
  type ModelResponse,
} from "@larkxai/node";
import { describe, expect, it } from "vitest";

const entry = fileURLToPath(new URL("../../examples/node-agent/dist/main.js", import.meta.url));

describe("C++ runtime process termination", () => {
  it("retries a model call killed before its decision is committed", async () => {
    const directory = mkdtempSync(join(tmpdir(), "larkx-model-kill-"));
    const database = join(directory, "agent.db");
    const log = join(directory, "calls.log");
    const killed = await run(["--database", database, "--log", log, "--crash-during", "model"]);
    expect(killed.signal).toBe("SIGKILL");
    expect(readLines(log)).toEqual(["model"]);

    const resumed = await run(["--database", database, "--log", log, "--resume"]);
    expect(resumed.code).toBe(0);
    expect(readLines(log)).toEqual([
      "model",
      "model",
      "read_notes",
      "model",
      "save_report",
      "model",
    ]);
    expect(JSON.parse(resumed.stdout).message).toBe("Seal needs service.");
  });

  it("retries a pure tool killed inside the handler and does not repeat the committed model call", async () => {
    const directory = mkdtempSync(join(tmpdir(), "larkx-tool-kill-"));
    const database = join(directory, "agent.db");
    const log = join(directory, "calls.log");
    const killed = await run([
      "--database",
      database,
      "--log",
      log,
      "--crash-during",
      "read_notes",
    ]);
    expect(killed.signal).toBe("SIGKILL");
    expect(readLines(log)).toEqual(["model", "read_notes"]);

    const resumed = await run(["--database", database, "--log", log, "--resume"]);
    expect(resumed.code).toBe(0);
    expect(readLines(log)).toEqual([
      "model",
      "read_notes",
      "read_notes",
      "model",
      "save_report",
      "model",
    ]);
  });

  it("blocks a non-idempotent tool killed inside the handler", async () => {
    const directory = mkdtempSync(join(tmpdir(), "larkx-unknown-"));
    const database = join(directory, "agent.db");
    const log = join(directory, "calls.log");
    await run([
      "--database",
      database,
      "--log",
      log,
      "--non-idempotent",
      "--crash-during",
      "save_report",
    ]);
    const resumed = await run([
      "--database",
      database,
      "--log",
      log,
      "--non-idempotent",
      "--resume",
    ]);
    expect(resumed.code).toBe(2);
    expect(JSON.parse(resumed.stdout).status).toBe("BLOCKED");
    expect(readLines(log).filter((line) => line === "save_report")).toEqual(["save_report"]);
    const blocked = await steps(database, "non-idempotent");
    expect(
      blocked.find((step) => step.stepKey.startsWith("tool-") && step.status === "UNKNOWN_OUTCOME"),
    ).toBeDefined();
  });

  it("keeps the model operation id when inference is killed before commit", async () => {
    const directory = mkdtempSync(join(tmpdir(), "larkx-model-id-"));
    const database = join(directory, "agent.db");
    const log = join(directory, "calls.log");
    const killed = await run(["--database", database, "--log", log, "--crash-during", "model"]);
    expect(killed.signal).toBe("SIGKILL");
    const before = await steps(database);
    const running = before.find(
      (step) => step.stepKey.startsWith("model-") && step.status === "RUNNING",
    );
    expect(running?.operationId.length).toBeGreaterThan(0);

    const resumed = await run(["--database", database, "--log", log, "--resume"]);
    expect(resumed.code).toBe(0);
    const after = await steps(database);
    const completed = after.find((step) => step.stepKey === running?.stepKey);
    expect(completed?.status).toBe("COMPLETED");
    expect(completed?.operationId).toBe(running?.operationId);
    expect(readLines(log).filter((line) => line === "model").length).toBeGreaterThan(1);
  });

  it("does not repeat a committed model decision", async () => {
    const directory = mkdtempSync(join(tmpdir(), "larkx-model-committed-"));
    const database = join(directory, "agent.db");
    const log = join(directory, "calls.log");
    expect(
      (await run(["--database", database, "--log", log, "--crash-during", "read_notes"])).signal,
    ).toBe("SIGKILL");
    const resumed = await run(["--database", database, "--log", log, "--resume"]);
    expect(resumed.code).toBe(0);
    const recorded = await steps(database);
    const decision = recorded.find((step) => step.stepKey === "model-0");
    expect(decision?.status).toBe("COMPLETED");
    expect(decision?.attemptCount).toBe(1);
    expect(readLines(log).filter((line) => line === "model").length).toBeGreaterThan(1);
  });

  it("does not repeat a committed tool result", async () => {
    const directory = mkdtempSync(join(tmpdir(), "larkx-tool-committed-"));
    const database = join(directory, "agent.db");
    const log = join(directory, "calls.log");
    expect(
      (await run(["--database", database, "--log", log, "--crash-during", "after_save"])).signal,
    ).toBe("SIGKILL");
    const before = await steps(database);
    const committed = before.filter(
      (step) => step.status === "COMPLETED" && step.stepKey.startsWith("tool-"),
    );
    expect(committed.length).toBeGreaterThan(0);
    const resumed = await run(["--database", database, "--log", log, "--resume"]);
    expect(resumed.code).toBe(0);
    expect(readLines(log).filter((line) => line === "save_report")).toEqual(["save_report"]);
    const after = await steps(database);
    for (const step of committed) {
      expect(after.find((candidate) => candidate.stepKey === step.stepKey)?.operationId).toBe(
        step.operationId,
      );
      expect(after.find((candidate) => candidate.stepKey === step.stepKey)?.attemptCount).toBe(1);
    }
  });

  it("retries an idempotent tool with the same operation id and does not duplicate its effect", async () => {
    const directory = mkdtempSync(join(tmpdir(), "larkx-idempotent-"));
    const database = join(directory, "agent.db");
    const log = join(directory, "calls.log");
    expect(
      (await run(["--database", database, "--log", log, "--crash-during", "save_report"])).signal,
    ).toBe("SIGKILL");
    const before = await steps(database);
    const interrupted = before.find(
      (step) => step.status === "RUNNING" && step.stepKey.startsWith("tool-"),
    );
    expect(readFileSync(`${log}.effects`, "utf8").trim()).toBe(interrupted?.operationId);

    const resumed = await run(["--database", database, "--log", log, "--resume"]);
    expect(resumed.code).toBe(0);
    expect(readFileSync(`${log}.effects`, "utf8").trim().split("\n")).toEqual([
      interrupted?.operationId,
    ]);
    expect(readLines(log).filter((line) => line === "save_report")).toEqual([
      "save_report",
      "save_report",
    ]);
    const after = await steps(database);
    expect(after.find((step) => step.stepKey === interrupted?.stepKey)?.operationId).toBe(
      interrupted?.operationId,
    );
  });

  it("reconciles an unknown outcome and finishes without repeating the tool", async () => {
    const directory = mkdtempSync(join(tmpdir(), "larkx-reconcile-"));
    const database = join(directory, "agent.db");
    const log = join(directory, "calls.log");
    await run([
      "--database",
      database,
      "--log",
      log,
      "--non-idempotent",
      "--crash-during",
      "save_report",
    ]);
    const resumed = await run([
      "--database",
      database,
      "--log",
      log,
      "--non-idempotent",
      "--resume",
    ]);
    expect(resumed.code).toBe(2);
    let repeated = 0;
    const runtime = await createRuntime({
      storage: sqlite(database),
      ownerId: "node-agent",
      leaseMs: 0,
    });
    runtime.createAgent({
      name: "notes-agent",
      version: 1,
      model: historyModel(),
      instructions: "Inspect the equipment and save a short report.",
      tools: [
        defineTool({
          name: "read_notes",
          description: "Read the local inspection notes.",
          effects: "pure",
          schema: { type: "object", properties: {} },
          handler: () => ({ notes: ["Seal weeps above 80 psi."] }),
        }),
        defineTool({
          name: "save_report",
          description: "Save the inspection report on this device.",
          effects: "non-idempotent",
          schema: {
            type: "object",
            properties: { report: { type: "string" } },
            required: ["report"],
          },
          handler: () => {
            repeated += 1;
            return { saved: true };
          },
        }),
      ],
    });
    let resolveReady: () => void = () => undefined;
    const ready = new Promise<void>((resolve) => {
      resolveReady = resolve;
    });
    const stopObserving = runtime.observe((event) => {
      if (event.type === "reconcile-required" && event.runId === "notes-run") {
        setImmediate(resolveReady);
      }
    });
    const runHandle = await runtime.resume("notes-run");
    const pending = runHandle.result();
    await ready;
    await runHandle.reconcile({
      resolution: "complete",
      output: { saved: true },
      message: "The report was saved before the process died.",
    });
    expect(await pending).toMatchObject({ message: "Seal needs service." });
    expect(repeated).toBe(0);
    expect(readLines(log).filter((line) => line === "save_report")).toEqual(["save_report"]);
    stopObserving();
    await runtime.close();
  });

  it("rejects a database that does not have the runtime application id", async () => {
    const directory = mkdtempSync(join(tmpdir(), "larkx-legacy-db-"));
    const database = join(directory, "legacy.db");
    const created = new DatabaseSync(database);
    created.exec(
      "CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, applied_at INTEGER NOT NULL);" +
        "INSERT INTO schema_migrations (version, applied_at) VALUES (1, 0);" +
        "CREATE TABLE workflow_runs (run_id TEXT PRIMARY KEY)",
    );
    created.close();
    await expect(
      createRuntime({ storage: sqlite(database), ownerId: "node-agent", leaseMs: 0 }),
    ).rejects.toThrow(/was not deleted/);
    const check = new DatabaseSync(database);
    const table = check
      .prepare("SELECT name FROM sqlite_master WHERE name = 'workflow_runs'")
      .get() as { name: string } | undefined;
    const identity = check.prepare("PRAGMA application_id").get() as { application_id: number };
    check.close();
    expect(table?.name).toBe("workflow_runs");
    expect(identity.application_id).toBe(0);
  });
});

function run(
  args: readonly string[],
): Promise<{ code: number | null; signal: NodeJS.Signals | null; stdout: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [entry, ...args], { stdio: ["ignore", "pipe", "pipe"] });
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

function readLines(path: string): string[] {
  return readFileSync(path, "utf8")
    .split("\n")
    .filter((line) => line.length > 0);
}

const toolCall: ModelResponse = {
  message: null,
  finish: "tool_calls",
  calls: [{ id: "call-1", name: "read_notes", arguments: {} }],
};
const saveCall: ModelResponse = {
  message: null,
  finish: "tool_calls",
  calls: [{ id: "call-2", name: "save_report", arguments: { report: "Seal weeps." } }],
};
const summary: ModelResponse = {
  message: "Seal needs service.",
  finish: "stop",
  calls: [],
};

function historyModel() {
  return {
    id: "scripted",
    model: "scripted-notes",
    capabilities: { toolCalling: true },
    async complete(request: { readonly messages: readonly unknown[] }) {
      const text = JSON.stringify(request.messages);
      if (text.includes("save_report")) return summary;
      if (text.includes("read_notes")) return saveCall;
      return toolCall;
    },
  };
}

async function steps(
  database: string,
  saveEffects: "idempotent" | "non-idempotent" = "idempotent",
): Promise<HistoryStep[]> {
  const runtime = await createRuntime({
    storage: sqlite(database),
    ownerId: "node-agent",
    leaseMs: 0,
  });
  runtime.createAgent({
    name: "notes-agent",
    version: 1,
    model: historyModel(),
    instructions: "Inspect the equipment and save a short report.",
    tools: [
      defineTool({
        name: "read_notes",
        description: "Read the local inspection notes.",
        effects: "pure",
        schema: { type: "object", properties: {} },
        handler: () => ({ notes: ["Seal weeps above 80 psi."] }),
      }),
      defineTool({
        name: "save_report",
        description: "Save the inspection report on this device.",
        effects: saveEffects,
        schema: {
          type: "object",
          properties: { report: { type: "string" } },
          required: ["report"],
        },
        handler: () => ({ saved: true }),
      }),
    ],
  });
  const run = await runtime.resume("notes-run", { defer: true });
  const history = await run.getHistory();
  await runtime.close();
  return [...history.steps];
}
