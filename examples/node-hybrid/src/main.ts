import { closeSync, fsyncSync, openSync, writeSync } from "node:fs";

import {
  createRuntime,
  defineTool,
  remoteAgent,
  sqlite,
  type ModelResponse,
  type RemoteCapabilities,
} from "@larkxai/node";

const NOTES = "Pump P-104 seal weeps. Do not send this sentence to the remote agent.";

interface Args {
  readonly database: string;
  readonly log: string;
  readonly endpoint: string;
  readonly crashDuring?: string;
  readonly resume: boolean;
  readonly offline: boolean;
  readonly reconcile?: "complete" | "fail";
  readonly capabilities: RemoteCapabilities;
  readonly token?: string;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const online = !args.offline;
  const runtime = await createRuntime({
    storage: sqlite(args.database),
    ownerId: "field-assistant",
    leaseMs: 0,
    isOnline: () => online,
  });
  const readNotes = defineTool({
    name: "read_inspection_notes",
    description: "Read the locally stored inspection notes.",
    effects: "pure",
    schema: { type: "object", properties: {} },
    handler: () => {
      record(args.log, "read_inspection_notes");
      return { notes: [NOTES] };
    },
  });
  const equipment = defineTool({
    name: "get_equipment_details",
    description: "Read the local equipment specification.",
    effects: "pure",
    schema: {
      type: "object",
      properties: { equipmentId: { type: "string" } },
      required: ["equipmentId"],
    },
    handler: () => {
      record(args.log, "get_equipment_details");
      return { equipmentId: "pump-12", spec: "Industrial water pump, mechanical seal." };
    },
  });
  const saveReport = defineTool({
    name: "save_report",
    description: "Save the inspection report on this device.",
    effects: "idempotent",
    schema: {
      type: "object",
      properties: { report: { type: "string" } },
      required: ["report"],
    },
    handler: (input) => {
      record(args.log, "save_report");
      const report =
        typeof input === "object" && input !== null && "report" in input ? input.report : "";
      return { saved: true, report };
    },
  });
  const procurement = remoteAgent({
    name: "procurement-agent",
    description: "Find compatible replacement parts and suppliers.",
    schema: {
      type: "object",
      properties: {
        objective: { type: "string" },
        equipment: { type: "string" },
        component: { type: "string" },
      },
      required: ["objective", "equipment", "component"],
      additionalProperties: false,
    },
    transport: {
      type: "http",
      endpoint: args.endpoint,
      capabilities: args.capabilities,
      pollIntervalMs: 50,
      headers: () => (args.token === undefined ? {} : { authorization: `Bearer ${args.token}` }),
    },
  });
  const agent = runtime.createAgent({
    name: "field-assistant",
    version: 1,
    model: historyModel(args),
    instructions: "Inspect equipment and identify replacement parts.",
    tools: [readNotes, equipment, saveReport],
    remoteAgents: [procurement],
  });
  await agent.whenRegistered();
  runtime.holdExecution(async (event) => {
    if (event.type === "remote-requested") {
      record(args.log, `remote-requested ${event.action ?? ""}`);
      if (args.crashDuring === "before-submit" && event.action === "submit") {
        stop();
      }
      if (args.crashDuring === "after-accept" && event.action === "poll") {
        stop();
      }
      if (args.crashDuring === "during-poll" && event.action === "poll") {
        record(args.log, "poll-open");
      }
    }
    if (event.type === "remote-response") {
      record(args.log, `remote-response ${event.action ?? ""} ${event.outcome ?? ""}`);
      if (args.crashDuring === "after-submit" && event.action === "submit") {
        stop();
      }
      if (args.crashDuring === "before-commit" && event.outcome === "completed") {
        stop();
      }
    }
    if (event.type === "remote-waiting") {
      record(args.log, `remote-waiting ${event.waitingFor ?? ""}`);
    }
  });
  let markBlocked: (runId: string) => void = () => undefined;
  const blocked = new Promise<string>((resolve) => {
    markBlocked = resolve;
  });
  runtime.observe((event) => {
    if (event.type === "reconcile-required") {
      markBlocked(event.runId);
    }
  });
  try {
    const run = args.resume
      ? await runtime.resume("field-run")
      : await agent.start({
          message: "Inspect pump P-104 and recommend replacement parts.",
          runId: "field-run",
        });
    const settled = run.result().then(
      (result) => ({ kind: "done" as const, result }),
      (error: unknown) => ({ kind: "error" as const, error }),
    );
    const outcome = await Promise.race([
      settled,
      blocked.then((runId) => ({ kind: "blocked" as const, runId })),
    ]);
    if (outcome.kind === "blocked") {
      if (args.reconcile === undefined) {
        const status = await run.getStatus();
        const delegations = await run.getDelegations();
        const first = delegations[0];
        writeResult({
          status: "BLOCKED",
          ...(status.blockedReason.length > 0 ? { reason: status.blockedReason } : {}),
          ...(first?.operationId !== undefined ? { operationId: first.operationId } : {}),
          ...(first?.taskId !== undefined ? { taskId: first.taskId } : {}),
          ...(first?.state !== undefined ? { delegation: first.state } : {}),
        });
        await runtime.close();
        process.exitCode = 2;
        return;
      }
      await run.reconcile({
        resolution: args.reconcile,
        output: {
          ok: args.reconcile === "complete",
          name: "procurement-agent",
          callId: "call-remote",
          error: null,
          output: {
            simulated: true,
            recommendations: [
              {
                supplier: "Example Industrial Supply",
                part: "Compatible Mechanical seal",
                estimatedPrice: 240,
                simulated: true,
              },
            ],
          },
        },
        message: "Reconciled from the local record.",
      });
    }
    const finished = outcome.kind === "done" ? outcome : await settled;
    if (finished.kind === "error") {
      throw finished.error;
    }
    if (finished.kind !== "done") {
      throw new Error("The run did not finish.");
    }
    const result = finished.result;
    const delegations = await run.getDelegations();
    const first = delegations[0];
    writeResult({
      status: "COMPLETED",
      message: result.message,
      ...(first?.operationId !== undefined ? { operationId: first.operationId } : {}),
      ...(first?.taskId !== undefined ? { taskId: first.taskId } : {}),
      ...(first?.state !== undefined ? { delegation: first.state } : {}),
    });
    await runtime.close();
  } catch (error) {
    const status = await runtime.inspect("field-run").catch(() => null);
    const delegations = await runtime
      .resume("field-run", { defer: true })
      .then((run) => run.getDelegations())
      .catch(() => []);
    const failed = delegations[0];
    writeResult({
      status: status?.status ?? "FAILED",
      error: error instanceof Error ? error.message : "unknown error",
      ...(status?.blockedReason !== undefined ? { reason: status.blockedReason } : {}),
      ...(failed?.operationId !== undefined ? { operationId: failed.operationId } : {}),
      ...(failed?.taskId !== undefined ? { taskId: failed.taskId } : {}),
      ...(failed?.state !== undefined ? { delegation: failed.state } : {}),
    });
    await runtime.close();
    process.exitCode = status?.status === "BLOCKED" ? 2 : 1;
  }
}

function historyModel(args: Args) {
  return {
    id: "scripted",
    model: "scripted-field",
    capabilities: { toolCalling: true },
    async complete(request: { readonly messages: readonly unknown[] }): Promise<ModelResponse> {
      record(args.log, "model");
      const text = JSON.stringify(request.messages);
      if (args.crashDuring === "after-commit" && text.includes("Example Industrial Supply")) {
        stop();
      }
      return nextResponse(request.messages);
    },
  };
}

function nextResponse(messages: readonly unknown[]): ModelResponse {
  const called = toolNames(messages);
  if (!called.has("read_inspection_notes")) {
    return call("call-notes", "read_inspection_notes", {});
  }
  if (!called.has("get_equipment_details")) {
    return call("call-spec", "get_equipment_details", { equipmentId: "pump-12" });
  }
  if (!called.has("procurement-agent")) {
    return call("call-remote", "procurement-agent", {
      objective: "Find compatible replacement parts for pump P-104",
      equipment: "Industrial water pump",
      component: "Mechanical seal",
    });
  }
  if (!called.has("save_report")) {
    return call("call-save", "save_report", {
      report: "Simulated supplier: Example Industrial Supply. Compatible mechanical seal.",
    });
  }
  return {
    message: "Pump P-104 needs a mechanical seal from Example Industrial Supply.",
    finish: "stop",
    calls: [],
  };
}

function call(id: string, name: string, args: { readonly [key: string]: string }): ModelResponse {
  return { message: null, finish: "tool_calls", calls: [{ id, name, arguments: args }] };
}

function toolNames(messages: readonly unknown[]): Set<string> {
  const names = new Set<string>();
  for (const message of messages) {
    if (typeof message !== "object" || message === null || Array.isArray(message)) {
      continue;
    }
    const record = message as { readonly role?: unknown; readonly name?: unknown };
    if (record.role === "tool" && typeof record.name === "string") {
      names.add(record.name);
    }
  }
  return names;
}

function record(log: string, line: string): void {
  const fd = openSync(log, "a");
  writeSync(fd, `${line}\n`);
  fsyncSync(fd);
  closeSync(fd);
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
  readonly operationId?: string | null;
  readonly taskId?: string | null;
  readonly delegation?: string;
}): void {
  process.stdout.write(`${JSON.stringify(value)}\n`);
}

function parseArgs(argv: readonly string[]): Args {
  let database = "";
  let log = "";
  let endpoint = "";
  let crashDuring: string | undefined;
  let resume = false;
  let offline = false;
  let reconcile: "complete" | "fail" | undefined;
  let token: string | undefined;
  let capabilities = fullCapabilities();
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    const next = argv[index + 1];
    if (flag === "--database" && next !== undefined) {
      database = next;
      index += 1;
    } else if (flag === "--log" && next !== undefined) {
      log = next;
      index += 1;
    } else if (flag === "--endpoint" && next !== undefined) {
      endpoint = next;
      index += 1;
    } else if (flag === "--crash-during" && next !== undefined) {
      crashDuring = next;
      index += 1;
    } else if (flag === "--resume") {
      resume = true;
    } else if (flag === "--offline") {
      offline = true;
    } else if (flag === "--reconcile" && (next === "complete" || next === "fail")) {
      reconcile = next;
      index += 1;
    } else if (flag === "--token" && next !== undefined) {
      token = next;
      index += 1;
    } else if (flag === "--capabilities" && next !== undefined) {
      capabilities = capabilitiesFor(next);
      index += 1;
    }
  }
  if (database.length === 0 || log.length === 0 || endpoint.length === 0) {
    throw new Error("Pass --database, --log, and --endpoint.");
  }
  return {
    database,
    log,
    endpoint,
    resume,
    offline,
    capabilities,
    ...(crashDuring !== undefined ? { crashDuring } : {}),
    ...(reconcile !== undefined ? { reconcile } : {}),
    ...(token !== undefined ? { token } : {}),
  };
}

/** Explicit declaration for `examples/remote-task`. These are not HTTP defaults. */
function fullCapabilities(): RemoteCapabilities {
  return { dedupe: true, lookup: true, taskId: true, poll: true, cancel: true, persistent: true };
}

function capabilitiesFor(name: string): RemoteCapabilities {
  if (name === "full") {
    return fullCapabilities();
  }
  if (name === "dedupe") {
    return { ...fullCapabilities(), lookup: false };
  }
  if (name === "lookup") {
    return { ...fullCapabilities(), dedupe: false };
  }
  if (name === "none") {
    return {
      dedupe: false,
      lookup: false,
      taskId: true,
      poll: true,
      cancel: false,
      persistent: true,
    };
  }
  throw new Error(`Unknown capabilities "${name}".`);
}

void main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : "unknown error"}\n`);
  process.exitCode = 1;
});
