import { spawn } from "node:child_process";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const harness = fileURLToPath(new URL("./restart-harness.ts", import.meta.url));
const API_KEY = "lkx_ing_restart_secret";

describe("telemetry recovery across SIGKILL", () => {
  it("retries the unacknowledged batch and does not repeat the committed handler", async () => {
    const directory = mkdtempSync(join(tmpdir(), "larkx-telemetry-kill-"));
    const received: Array<{ key: string; body: string }> = [];
    const server = createServer((request, response) => {
      void readBody(request).then((body) => {
        const key = request.headers["idempotency-key"];
        received.push({ key: typeof key === "string" ? key : "", body });
        if (received.length === 1) {
          return;
        }
        const parsed = JSON.parse(body) as {
          batchId: string;
          runs: Array<{ runId: string; throughSequence: number }>;
        };
        const run = parsed.runs[0];
        respond(response, {
          telemetryVersion: 1,
          batchId: parsed.batchId,
          results: [
            {
              runId: run?.runId,
              status: "accepted",
              acceptedThroughSequence: run?.throughSequence,
              duplicateSequences: [],
            },
          ],
        });
      });
    });
    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", () => resolve());
    });
    const address = server.address();
    if (!address || typeof address === "string") {
      throw new Error("missing port");
    }
    const endpoint = `http://127.0.0.1:${String(address.port)}`;
    try {
      const database = join(directory, "workflow.sqlite");
      const state = join(directory, "telemetry.sqlite");
      const log = join(directory, "handlers.log");
      const args = [
        "--database",
        database,
        "--state",
        state,
        "--endpoint",
        endpoint,
        "--api-key",
        API_KEY,
        "--log",
        log,
      ];
      const first = start([...args, "--phase", "first"]);
      await waitFor(() => received.length === 1);
      first.child.kill("SIGKILL");
      const killed = await first.done;
      expect(killed.signal).toBe("SIGKILL");
      expect(received[0]?.body).not.toContain("secret-prompt-do-not-upload");
      const resumed = await start([...args, "--phase", "second"]).done;
      expect(resumed.code).toBe(0);
      expect(JSON.parse(resumed.stdout).delivered).toBe(true);
      expect(received).toHaveLength(2);
      expect(received[0]?.key).toBe(received[1]?.key);
      expect(received[0]?.body).toBe(received[1]?.body);
      const handlers = readFileSync(log, "utf8").trim().split("\n");
      expect(handlers).toHaveLength(1);
    } finally {
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
      rmSync(directory, { recursive: true, force: true });
    }
  });
});

function start(args: string[]): {
  child: ReturnType<typeof spawn>;
  done: Promise<{ code: number | null; signal: NodeJS.Signals | null; stdout: string }>;
} {
  const child = spawn(process.execPath, ["--experimental-strip-types", harness, ...args], {
    stdio: ["ignore", "pipe", "pipe"],
  });
  const done = new Promise<{ code: number | null; signal: NodeJS.Signals | null; stdout: string }>(
    (resolve, reject) => {
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
        if (code !== 0 && signal !== "SIGKILL") {
          reject(new Error(stderr || stdout || `exit ${String(code)}`));
          return;
        }
        resolve({ code, signal, stdout });
      });
    },
  );
  return { child, done };
}

function waitFor(ready: () => boolean): Promise<void> {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const timer = setInterval(() => {
      if (ready()) {
        clearInterval(timer);
        resolve();
      } else if (Date.now() - started > 10_000) {
        clearInterval(timer);
        reject(new Error("timed out waiting for the batch"));
      }
    }, 20);
  });
}

function readBody(request: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer) => chunks.push(chunk));
    request.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    request.on("error", reject);
  });
}

function respond(response: ServerResponse, body: unknown): void {
  response.writeHead(200, { "content-type": "application/json" });
  response.end(JSON.stringify(body));
}
