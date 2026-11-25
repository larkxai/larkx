import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

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
