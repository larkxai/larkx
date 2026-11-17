import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const entry = fileURLToPath(new URL("../../examples/node-workflow/dist/main.js", import.meta.url));

describe("process termination", () => {
  it("skips a committed step after SIGKILL and retries an interrupted pure step", async () => {
    const directory = mkdtempSync(join(tmpdir(), "larkx-crash-"));
    const database = join(directory, "larkx.db");
    const log = join(directory, "calls.log");

    const killed = await run([
      "--database",
      database,
      "--log",
      log,
      "--crash-after-commit",
      "normalize",
    ]);
    expect(killed.signal).toBe("SIGKILL");
    expect(readLines(log)).toEqual(["normalize"]);

    const resumed = await run(["--database", database, "--log", log]);
    expect(resumed.code).toBe(0);
    expect(readLines(log)).toEqual(["normalize", "count", "summarize"]);
    expect(JSON.parse(resumed.stdout).output.normalized).toBe("hello larkx");
  });

  it("retries a pure step killed inside the handler and before commit", async () => {
    const during = mkdtempSync(join(tmpdir(), "larkx-during-"));
    await run([
      "--database",
      join(during, "larkx.db"),
      "--log",
      join(during, "calls.log"),
      "--crash-during",
      "count",
    ]);
    const duringResume = await run([
      "--database",
      join(during, "larkx.db"),
      "--log",
      join(during, "calls.log"),
    ]);
    expect(duringResume.code).toBe(0);
    expect(readLines(join(during, "calls.log"))).toEqual([
      "normalize",
      "count",
      "count",
      "summarize",
    ]);

    const before = mkdtempSync(join(tmpdir(), "larkx-before-"));
    await run([
      "--database",
      join(before, "larkx.db"),
      "--log",
      join(before, "calls.log"),
      "--crash-before-commit",
      "count",
    ]);
    const beforeResume = await run([
      "--database",
      join(before, "larkx.db"),
      "--log",
      join(before, "calls.log"),
    ]);
    expect(beforeResume.code).toBe(0);
    expect(readLines(join(before, "calls.log"))).toEqual([
      "normalize",
      "count",
      "count",
      "summarize",
    ]);
  });

  it("does not retry a non-idempotent step after SIGKILL", async () => {
    const directory = mkdtempSync(join(tmpdir(), "larkx-unsafe-"));
    const database = join(directory, "larkx.db");
    const log = join(directory, "calls.log");
    await run([
      "--database",
      database,
      "--log",
      log,
      "--workflow",
      "charge-once",
      "--crash-during",
      "charge",
    ]);
    const resumed = await run(["--database", database, "--log", log, "--workflow", "charge-once"]);
    expect(resumed.code).toBe(2);
    expect(JSON.parse(resumed.stdout).status).toBe("BLOCKED");
    expect(readLines(log)).toEqual(["charge"]);
  });

  it("does not let two restarted processes both execute the interrupted step", async () => {
    const directory = mkdtempSync(join(tmpdir(), "larkx-race-"));
    const database = join(directory, "larkx.db");
    const log = join(directory, "calls.log");
    await run(["--database", database, "--log", log, "--crash-during", "count"]);
    await Promise.all([
      run(["--database", database, "--log", log, "--step-delay", "250"]),
      run(["--database", database, "--log", log, "--step-delay", "250"]),
    ]);
    const final = await run(["--database", database, "--log", log]);
    expect(final.code).toBe(0);
    const lines = readLines(log);
    expect(lines.filter((line) => line === "normalize")).toHaveLength(1);
    expect(lines.filter((line) => line === "count")).toHaveLength(2);
    expect(lines.filter((line) => line === "summarize")).toHaveLength(1);
  });
});

function readLines(path: string): string[] {
  return readFileSync(path, "utf8")
    .split("\n")
    .filter((line) => line.length > 0);
}

function run(
  args: string[],
): Promise<{ code: number | null; signal: NodeJS.Signals | null; stdout: string; stderr: string }> {
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
    child.on("exit", (code, signal) => {
      resolve({ code, signal, stdout, stderr });
    });
  });
}
