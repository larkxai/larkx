import { closeSync, existsSync, fsyncSync, openSync, readFileSync, writeSync } from "node:fs";

import { createRuntime, defineTool, sqlite, type ModelResponse } from "@larkxai/node";

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

interface Args {
  readonly database: string;
  readonly log: string;
  readonly crashDuring?: string;
  readonly resume: boolean;
  readonly nonIdempotent: boolean;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const runtime = await createRuntime({
    storage: sqlite(args.database),
    ownerId: "node-agent",
    leaseMs: 0,
  });
  const readNotes = defineTool({
    name: "read_notes",
    description: "Read the local inspection notes.",
    effects: "pure",
    schema: { type: "object", properties: {} },
    handler: () => {
      record(args.log, "read_notes");
      if (args.crashDuring === "read_notes") {
        stop();
      }
      return { notes: ["Seal weeps above 80 psi."] };
    },
  });
  const saveReport = defineTool({
    name: "save_report",
    description: "Save the inspection report on this device.",
    effects: args.nonIdempotent ? "non-idempotent" : "idempotent",
    schema: {
      type: "object",
      properties: { report: { type: "string" } },
      required: ["report"],
    },
    handler: (_input, context) => {
      record(args.log, "save_report");
      recordOnce(`${args.log}.effects`, context.operationId);
      if (args.crashDuring === "save_report") {
        stop();
      }
      return { saved: true };
    },
  });
  const agent = runtime.createAgent({
    name: "notes-agent",
    version: 1,
    model: {
      id: "scripted",
      model: "scripted-notes",
      capabilities: { toolCalling: true },
      async complete(request) {
        record(args.log, "model");
        if (args.crashDuring === "model") {
          stop();
        }
        const text = JSON.stringify(request.messages);
        if (args.crashDuring === "after_save" && text.includes("save_report")) {
          stop();
        }
        if (text.includes("save_report")) {
          return summary;
        }
        if (text.includes("read_notes")) {
          return saveCall;
        }
        return toolCall;
      },
    },
    instructions: "Inspect the equipment and save a short report.",
    tools: [readNotes, saveReport],
  });
  await agent.whenRegistered();
  let markBlocked: () => void = () => undefined;
  const blocked = new Promise<void>((resolve) => {
    markBlocked = resolve;
  });
  const stopObserving = runtime.observe((event) => {
    if (event.type === "reconcile-required" && event.runId === "notes-run") {
      markBlocked();
    }
  });
  try {
    const run = args.resume
      ? await runtime.resume("notes-run")
      : await agent.start({ message: "Inspect pump 12", runId: "notes-run" });
    const settled = run.result().then(
      (result) => ({ kind: "done" as const, result }),
      (error: unknown) => ({ kind: "error" as const, error }),
    );
    const outcome = await Promise.race([
      settled,
      blocked.then(() => ({ kind: "blocked" as const })),
    ]);
    if (outcome.kind === "blocked") {
      const status = await run.getStatus();
      writeResult({ status: "BLOCKED", reason: status.blockedReason });
      await runtime.close();
      process.exitCode = 2;
      return;
    }
    if (outcome.kind === "error") {
      throw outcome.error;
    }
    writeResult({ status: "COMPLETED", message: outcome.result.message });
    await runtime.close();
  } catch (error) {
    const status = await runtime.inspect("notes-run").catch(() => null);
    writeResult({
      status: status?.status ?? "FAILED",
      error: error instanceof Error ? error.message : "unknown error",
    });
    await runtime.close();
    process.exitCode = status?.status === "BLOCKED" ? 2 : 1;
  } finally {
    stopObserving();
  }
}

function record(log: string, line: string): void {
  const fd = openSync(log, "a");
  writeSync(fd, `${line}\n`);
  fsyncSync(fd);
  closeSync(fd);
}

function recordOnce(log: string, line: string): void {
  const existing = existsSync(log) ? readFileSync(log, "utf8") : "";
  if (existing.split("\n").includes(line)) {
    return;
  }
  record(log, line);
}

function stop(): never {
  process.kill(process.pid, "SIGKILL");
  throw new Error("SIGKILL did not stop the process.");
}

function writeResult(value: {
  readonly status: string;
  readonly message?: string;
  readonly error?: string;
  readonly reason?: string;
}): void {
  process.stdout.write(`${JSON.stringify(value)}\n`);
}

function parseArgs(argv: readonly string[]): Args {
  let database = "";
  let log = "";
  let crashDuring: string | undefined;
  let resume = false;
  let nonIdempotent = false;
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    const next = argv[index + 1];
    if (flag === "--database" && next !== undefined) {
      database = next;
      index += 1;
    } else if (flag === "--log" && next !== undefined) {
      log = next;
      index += 1;
    } else if (flag === "--crash-during" && next !== undefined) {
      crashDuring = next;
      index += 1;
    } else if (flag === "--resume") {
      resume = true;
    } else if (flag === "--non-idempotent") {
      nonIdempotent = true;
    }
  }
  if (database.length === 0 || log.length === 0) {
    throw new Error("Pass --database and --log.");
  }
  return {
    database,
    log,
    resume,
    nonIdempotent,
    ...(crashDuring !== undefined ? { crashDuring } : {}),
  };
}

void main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : "unknown error"}\n`);
  process.exitCode = 1;
});
