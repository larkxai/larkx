import { closeSync, fsyncSync, openSync, readFileSync, writeSync } from "node:fs";

import { createNodeEngine } from "@larkxai/node";

import { chargeOnce, countLetters, setStepTracer } from "./workflow.js";

interface Args {
  database: string;
  log: string;
  workflow: "count-letters" | "charge-once";
  crashDuring?: string;
  crashBeforeCommit?: string;
  crashAfterCommit?: string;
  stepDelayMs: number;
  text: string;
  amount: number;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  setStepTracer(async (stepKey) => {
    record(args.log, stepKey);
    if (args.stepDelayMs > 0) {
      await delay(args.stepDelayMs);
    }
    if (args.crashDuring === stepKey) {
      stop("during-step");
    }
  });

  const engine = createNodeEngine({
    database: args.database,
    workflows: [countLetters, chargeOnce],
    leaseMs: 30_000,
    hooks: {
      beforeStepCommit(info) {
        if (info.stepKey === args.crashBeforeCommit) {
          stop("before-commit");
        }
      },
      afterStepCommit(info) {
        if (info.stepKey === args.crashAfterCommit) {
          stop("after-commit");
        }
      },
    },
  });

  const runId = args.workflow === "charge-once" ? "charge-run" : "letters-run";
  try {
    const run =
      args.workflow === "charge-once"
        ? await engine.start(chargeOnce, { id: runId, input: { amount: args.amount } })
        : await engine.start(countLetters, { id: runId, input: { text: args.text } });
    const output = await run.result();
    const snapshot = await engine.getRun(run.id);
    writeResult({
      status: snapshot?.status ?? "COMPLETED",
      output,
      invocations: readLog(args.log),
    });
    await engine.close();
  } catch (error) {
    const snapshot = await safeSnapshot(engine, runId);
    writeResult({
      status: snapshot?.status ?? "FAILED",
      blockedReason: snapshot?.blockedReason ?? null,
      error: error instanceof Error ? error.message : "unknown error",
      invocations: readLog(args.log),
    });
    await engine.close();
    process.exitCode = snapshot?.status === "BLOCKED" ? 2 : 1;
  }
}

async function safeSnapshot(
  engine: { getRun(id: string): Promise<{ status: string; blockedReason: string | null } | null> },
  runId: string,
): Promise<{ status: string; blockedReason: string | null } | null> {
  try {
    return await engine.getRun(runId);
  } catch {
    return null;
  }
}

function writeResult(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value)}\n`);
}

function record(logPath: string, stepKey: string): void {
  const fd = openSync(logPath, "a");
  try {
    writeSync(fd, `${stepKey}\n`);
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
}

function readLog(logPath: string): string[] {
  try {
    return readFileSync(logPath, "utf8")
      .split("\n")
      .filter((line) => line.length > 0);
  } catch {
    return [];
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function stop(stage: string): never {
  process.stderr.write(`larkx example stopping at ${stage}\n`);
  process.kill(process.pid, "SIGKILL");
  throw new Error("process did not exit");
}

function parseArgs(argv: string[]): Args {
  const values = new Map<string, string>();
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token?.startsWith("--")) {
      continue;
    }
    const key = token.slice(2);
    const value = argv[index + 1];
    if (value === undefined || value.startsWith("--")) {
      values.set(key, "true");
    } else {
      values.set(key, value);
      index += 1;
    }
  }
  const database = values.get("database");
  const log = values.get("log");
  if (!database || !log) {
    throw new Error(
      "Usage: --database <path> --log <path> [--workflow count-letters|charge-once] [--crash-during <step>] [--crash-before-commit <step>] [--crash-after-commit <step>]",
    );
  }
  const workflow = values.get("workflow") ?? "count-letters";
  if (workflow !== "count-letters" && workflow !== "charge-once") {
    throw new Error(`Unknown workflow ${workflow}`);
  }
  const crashDuring = values.get("crash-during");
  const crashBeforeCommit = values.get("crash-before-commit");
  const crashAfterCommit = values.get("crash-after-commit");
  return {
    database,
    log,
    workflow,
    ...(crashDuring !== undefined ? { crashDuring } : {}),
    ...(crashBeforeCommit !== undefined ? { crashBeforeCommit } : {}),
    ...(crashAfterCommit !== undefined ? { crashAfterCommit } : {}),
    stepDelayMs: Number(values.get("step-delay") ?? "0"),
    text: values.get("text") ?? "Hello LarkX",
    amount: Number(values.get("amount") ?? "10"),
  };
}

void main();
