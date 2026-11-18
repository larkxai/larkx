import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const harness = fileURLToPath(new URL("./restart-harness.ts", import.meta.url));

describe("mobile storage across process death", () => {
  it("skips committed steps after SIGKILL and retries the interrupted pure step", async () => {
    const directory = mkdtempSync(join(tmpdir(), "larkx-mobile-notes-"));
    const database = join(directory, "larkx.db");
    const log = join(directory, "calls.log");
    const killed = await run(["--database", database, "--log", log, "--crash-during", "pause"]);
    expect(killed.signal).toBe("SIGKILL");
    expect(readLines(log)).toEqual(["intake", "count", "pause"]);

    const resumed = await run(["--database", database, "--log", log, "--workflow", "notes"]);
    expect(resumed.code).toBe(0);
    const lines = readLines(log);
    expect(lines.slice(0, 4)).toEqual(["intake", "count", "pause", "pause"]);
    expect(lines[4]).toMatch(/^record /);
    expect(lines.filter((line) => line === "intake")).toEqual(["intake"]);
    expect(lines.filter((line) => line === "count")).toEqual(["count"]);
    const output = JSON.parse(resumed.stdout) as { output: { normalized: string } };
    expect(output.output.normalized).toBe("hello larkx");
  });

  it("keeps the idempotent operation id across SIGKILL", async () => {
    const directory = mkdtempSync(join(tmpdir(), "larkx-mobile-record-"));
    const database = join(directory, "larkx.db");
    const log = join(directory, "calls.log");
    const killed = await run(["--database", database, "--log", log, "--crash-during", "record"]);
    expect(killed.signal).toBe("SIGKILL");
    const resumed = await run(["--database", database, "--log", log, "--workflow", "notes"]);
    expect(resumed.code).toBe(0);
    const records = readLines(log).filter((line) => line.startsWith("record "));
    expect(records).toHaveLength(2);
    expect(records[0]).toBe(records[1]);
  });

  it("blocks an interrupted non-idempotent step instead of repeating it", async () => {
    const directory = mkdtempSync(join(tmpdir(), "larkx-mobile-charge-"));
    const database = join(directory, "larkx.db");
    const log = join(directory, "calls.log");
    await run([
      "--database",
      database,
      "--log",
      log,
      "--workflow",
      "charge",
      "--crash-during",
      "charge",
    ]);
    const resumed = await run(["--database", database, "--log", log, "--workflow", "charge"]);
    expect(resumed.code).toBe(2);
    expect(JSON.parse(resumed.stdout).status).toBe("BLOCKED");
    expect(readLines(log)).toEqual([expect.stringMatching(/^charge /)]);
  });

  it("recovers an artifact after the temporary source and the process are gone", async () => {
    const directory = mkdtempSync(join(tmpdir(), "larkx-mobile-file-"));
    const source = join(directory, "source.txt");
    const artifactDir = join(directory, "artifacts");
    writeFileSync(source, "durable-bytes");
    const database = join(directory, "larkx.db");
    const log = join(directory, "calls.log");
    const killed = await run([
      "--database",
      database,
      "--log",
      log,
      "--workflow",
      "artifact",
      "--artifact-source",
      source,
      "--artifact-dir",
      artifactDir,
      "--crash-during",
      "attach",
    ]);
    expect(killed.signal).toBe("SIGKILL");
    rmSync(source);
    const resumed = await run([
      "--database",
      database,
      "--log",
      log,
      "--workflow",
      "artifact",
      "--artifact-source",
      source,
      "--artifact-dir",
      artifactDir,
    ]);
    expect(resumed.code).toBe(0);
    const lines = readLines(log);
    expect(lines).toHaveLength(2);
    expect(lines[0]).toBe(lines[1]);
    const output = JSON.parse(resumed.stdout) as { output: { localUri: string } };
    expect(readFileSync(output.output.localUri).toString()).toBe("durable-bytes");
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
