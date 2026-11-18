import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const harness = fileURLToPath(new URL("./restart-harness.ts", import.meta.url));

describe("agent recovery across SIGKILL", () => {
  it("retries an uncommitted model call and does not repeat the later tool", async () => {
    const directory = mkdtempSync(join(tmpdir(), "larkx-agent-model-"));
    try {
      const database = join(directory, "agent.db");
      const log = join(directory, "calls.log");
      const killed = await run(["--database", database, "--log", log, "--crash-during", "model"]);
      expect(killed.signal).toBe("SIGKILL");
      expect(readLines(log)).toEqual(["model"]);

      const resumed = await run(["--database", database, "--log", log]);
      expect(resumed.code).toBe(0);
      const lines = readLines(log);
      expect(lines.filter((line) => line === "model")).toHaveLength(3);
      const tools = lines.filter((line) => line.startsWith("tool "));
      expect(tools).toHaveLength(1);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("does not repeat a committed model decision and keeps the tool operation id", async () => {
    const directory = mkdtempSync(join(tmpdir(), "larkx-agent-tool-"));
    try {
      const database = join(directory, "agent.db");
      const log = join(directory, "calls.log");
      const killed = await run(["--database", database, "--log", log, "--crash-during", "tool"]);
      expect(killed.signal).toBe("SIGKILL");
      const resumed = await run(["--database", database, "--log", log]);
      expect(resumed.code).toBe(0);
      const lines = readLines(log);
      expect(lines.filter((line) => line === "model")).toHaveLength(2);
      const tools = lines.filter((line) => line.startsWith("tool "));
      expect(tools).toHaveLength(2);
      expect(tools[0]).toBe(tools[1]);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("blocks an interrupted non-idempotent tool instead of repeating it", async () => {
    const directory = mkdtempSync(join(tmpdir(), "larkx-agent-unsafe-"));
    try {
      const database = join(directory, "agent.db");
      const log = join(directory, "calls.log");
      await run(["--database", database, "--log", log, "--crash-during", "unsafe"]);
      const resumed = await run(["--database", database, "--log", log]);
      expect(resumed.code).toBe(2);
      expect(JSON.parse(resumed.stdout).status).toBe("BLOCKED");
      const lines = readLines(log);
      expect(lines.filter((line) => line === "model")).toEqual(["model"]);
      expect(lines.filter((line) => line.startsWith("unsafe "))).toHaveLength(1);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});

function run(
  args: string[],
): Promise<{ code: number | null; signal: NodeJS.Signals | null; stdout: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["--experimental-strip-types", harness, ...args], {
      stdio: ["ignore", "pipe", "pipe"],
    });
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
    child.on("exit", (code, signal) => {
      if (code !== 0 && code !== 2 && signal !== "SIGKILL") {
        reject(new Error(stderr || stdout || `harness exited ${String(code)}`));
        return;
      }
      resolve({ code, signal, stdout });
    });
  });
}

function readLines(path: string): string[] {
  return readFileSync(path, "utf8")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}
