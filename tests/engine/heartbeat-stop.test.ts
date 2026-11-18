import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const harness = fileURLToPath(new URL("./heartbeat-stop-harness.ts", import.meta.url));

describe("heartbeat shutdown", () => {
  it("does not keep the process alive until the next lease interval", async () => {
    const started = Date.now();
    const result = await new Promise<{ code: number | null; stderr: string }>((resolve, reject) => {
      const child = spawn(process.execPath, ["--experimental-strip-types", harness], {
        stdio: ["ignore", "ignore", "pipe"],
      });
      let stderr = "";
      child.stderr.setEncoding("utf8");
      child.stderr.on("data", (chunk: string) => {
        stderr += chunk;
      });
      child.on("error", reject);
      child.on("exit", (code) => {
        resolve({ code, stderr });
      });
    });
    expect(result.code).toBe(0);
    expect(result.stderr).toBe("");
    expect(Date.now() - started).toBeLessThan(5_000);
  });
});
