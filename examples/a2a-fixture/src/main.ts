import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFileSync, renameSync, writeFileSync } from "node:fs";

/**
 * Deterministic A2A 1.0 JSON-RPC peer for failure injection.
 * It is not a LangGraph agent and it does not deduplicate message ids.
 * Supplier text is simulated.
 */

interface Task {
  taskId: string;
  contextId: string;
  operationId: string;
  input: string;
  phase: "accepted" | "input" | "cancelled" | "failed";
  readyAt: number;
}

interface Store {
  next: number;
  delayMs: number;
  dropSendAck: number;
  inputRequired: boolean;
  failNext: boolean;
  sawAuthorization: boolean;
  sends: number;
  polls: number;
  created: number;
  publicUrl: string;
  tasks: Task[];
}

const args = parseArgs(process.argv.slice(2));
const store = load(args.data);
store.delayMs = args.delayMs;
store.publicUrl = `http://127.0.0.1:${String(args.port)}`;
save();

const server = createServer((request, response) => {
  void handle(request, response).catch((error: unknown) => {
    send(response, 500, {
      jsonrpc: "2.0",
      id: null,
      error: { code: -32603, message: error instanceof Error ? error.message : "fixture error" },
    });
  });
});

server.listen(args.port, "0.0.0.0", () => {
  process.stdout.write(
    `${JSON.stringify({ ready: true, port: args.port, protocol: "1.0", simulated: true })}\n`,
  );
});

async function handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
  const url = new URL(request.url ?? "/", "http://127.0.0.1");
  const body = await readBody(request);
  if (authorizationSeen(request)) {
    store.sawAuthorization = true;
    save();
  }
  if (request.method === "GET" && url.pathname === "/.well-known/agent-card.json") {
    send(response, 200, agentCard());
    return;
  }
  if (request.method === "GET" && url.pathname === "/_tasks") {
    send(response, 200, publicStore());
    return;
  }
  if (request.method === "POST" && url.pathname === "/_control") {
    applyControl(body);
    send(response, 200, { ok: true, simulated: true });
    return;
  }
  if (request.method === "POST" && (url.pathname === "/" || url.pathname === "")) {
    rpc(response, body);
    return;
  }
  send(response, 404, { jsonrpc: "2.0", id: null, error: { code: -32601, message: "Not found." } });
}

function rpc(response: ServerResponse, body: string): void {
  const parsed = parseObject(body);
  const id = parsed.id ?? null;
  const method = parsed.method;
  const params = isRecord(parsed.params) ? parsed.params : {};
  if (method === "SendMessage") {
    sendMessage(response, id, params);
    return;
  }
  if (method === "GetTask") {
    getTask(response, id, params);
    return;
  }
  if (method === "CancelTask") {
    cancelTask(response, id, params);
    return;
  }
  send(response, 200, {
    jsonrpc: "2.0",
    id,
    error: { code: -32601, message: `Method ${String(method)} is not supported by this fixture.` },
  });
}

function sendMessage(response: ServerResponse, id: unknown, params: Record<string, unknown>): void {
  store.sends += 1;
  const message = isRecord(params.message) ? params.message : undefined;
  const text = message === undefined ? "" : textOf(message.parts);
  const messageId =
    message !== undefined && typeof message.messageId === "string" ? message.messageId : "";
  const requestedTask =
    message !== undefined && typeof message.taskId === "string" ? message.taskId : undefined;
  if (messageId.length === 0) {
    save();
    send(response, 200, {
      jsonrpc: "2.0",
      id,
      error: { code: -32602, message: "messageId is required." },
    });
    return;
  }
  if (requestedTask !== undefined) {
    const existing = store.tasks.find((task) => task.taskId === requestedTask);
    if (existing === undefined) {
      save();
      send(response, 200, {
        jsonrpc: "2.0",
        id,
        error: { code: -32001, message: "Task not found." },
      });
      return;
    }
    if (existing.phase === "input") {
      existing.phase = "accepted";
      existing.readyAt = Date.now() + store.delayMs;
      existing.input = `${existing.input}\n${text}`;
    }
    finishSend(response, id, existing);
    return;
  }
  store.next += 1;
  store.created += 1;
  const task: Task = {
    taskId: `task-${String(store.next)}`,
    contextId: `ctx-${String(store.next)}`,
    operationId: messageId,
    input: text,
    phase: store.inputRequired && !/model/i.test(text) ? "input" : "accepted",
    readyAt: Date.now() + store.delayMs,
  };
  if (store.failNext) {
    task.phase = "failed";
    store.failNext = false;
  }
  store.tasks.push(task);
  finishSend(response, id, task);
}

function finishSend(response: ServerResponse, id: unknown, task: Task): void {
  save();
  if (store.sends === store.dropSendAck) {
    store.dropSendAck = 0;
    save();
    response.destroy();
    return;
  }
  send(response, 200, { jsonrpc: "2.0", id, result: { task: view(task) } });
}

function getTask(response: ServerResponse, id: unknown, params: Record<string, unknown>): void {
  store.polls += 1;
  save();
  const taskId = typeof params.id === "string" ? params.id : "";
  const task = store.tasks.find((item) => item.taskId === taskId);
  if (task === undefined) {
    send(response, 200, {
      jsonrpc: "2.0",
      id,
      error: { code: -32001, message: "Task not found." },
    });
    return;
  }
  send(response, 200, { jsonrpc: "2.0", id, result: view(task) });
}

function cancelTask(response: ServerResponse, id: unknown, params: Record<string, unknown>): void {
  const taskId = typeof params.id === "string" ? params.id : "";
  const task = store.tasks.find((item) => item.taskId === taskId);
  if (task === undefined) {
    send(response, 200, {
      jsonrpc: "2.0",
      id,
      error: { code: -32001, message: "Task not found." },
    });
    return;
  }
  if (task.phase === "accepted" || task.phase === "input") {
    task.phase = "cancelled";
    save();
  }
  send(response, 200, { jsonrpc: "2.0", id, result: view(task) });
}

function view(task: Task): { [key: string]: unknown } {
  const done = Date.now() >= task.readyAt;
  const state =
    task.phase === "input"
      ? "TASK_STATE_INPUT_REQUIRED"
      : task.phase === "cancelled"
        ? "TASK_STATE_CANCELED"
        : task.phase === "failed"
          ? "TASK_STATE_FAILED"
          : done
            ? "TASK_STATE_COMPLETED"
            : "TASK_STATE_WORKING";
  const prompt =
    state === "TASK_STATE_INPUT_REQUIRED"
      ? "What is the pump manufacturer's model number?"
      : state === "TASK_STATE_COMPLETED"
        ? "Simulated supplier: Example Industrial Supply. Compatible mechanical seal."
        : state === "TASK_STATE_FAILED"
          ? "Simulated supplier search failed."
          : "";
  return {
    id: task.taskId,
    contextId: task.contextId,
    status: {
      state,
      ...(prompt.length === 0
        ? {}
        : {
            message: {
              messageId: `${task.taskId}:status`,
              role: "ROLE_AGENT",
              parts: [{ text: prompt }],
            },
          }),
    },
    ...(state === "TASK_STATE_COMPLETED"
      ? {
          artifacts: [
            {
              artifactId: `${task.taskId}:result`,
              parts: [{ text: prompt }],
            },
          ],
        }
      : {}),
  };
}

function agentCard(): { [key: string]: unknown } {
  return {
    name: "procurement-fixture",
    description: "Simulated A2A fixture for failure injection. This is not a LangGraph agent.",
    version: "1.0.0",
    supportedInterfaces: [
      {
        url: store.publicUrl,
        protocolBinding: "JSONRPC",
        protocolVersion: "1.0",
      },
    ],
    capabilities: { streaming: false, pushNotifications: false, extensions: [] },
    skills: [
      {
        id: "supplier-search",
        name: "Supplier search",
        description: "Returns a simulated catalog row.",
      },
    ],
  };
}

function applyControl(body: string): void {
  const control = parseObject(body);
  if (
    typeof control.delayMs === "number" &&
    Number.isInteger(control.delayMs) &&
    control.delayMs >= 0
  ) {
    store.delayMs = control.delayMs;
  }
  if (typeof control.dropSendAck === "number" && Number.isInteger(control.dropSendAck)) {
    store.dropSendAck = control.dropSendAck;
  }
  if (control.inputRequired === true) {
    store.inputRequired = true;
  }
  if (control.failNext === true) {
    store.failNext = true;
  }
  save();
}

function publicStore(): { [key: string]: unknown } {
  return {
    sends: store.sends,
    polls: store.polls,
    created: store.created,
    sawAuthorization: store.sawAuthorization,
    simulated: true,
    tasks: store.tasks.map((task) => ({
      taskId: task.taskId,
      contextId: task.contextId,
      operationId: task.operationId,
      phase: task.phase,
      input: task.input,
    })),
  };
}

function textOf(parts: unknown): string {
  if (!Array.isArray(parts)) {
    return "";
  }
  return parts
    .map((part) => (isRecord(part) && typeof part.text === "string" ? part.text : ""))
    .filter((part) => part.length > 0)
    .join("\n");
}

function authorizationSeen(request: IncomingMessage): boolean {
  const value = request.headers.authorization;
  return (
    typeof value === "string" && value.startsWith("Bearer ") && value.length > "Bearer ".length
  );
}

function load(path: string): Store {
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as Store;
    parsed.dropSendAck = 0;
    parsed.inputRequired = false;
    parsed.failNext = false;
    return parsed;
  } catch {
    return {
      next: 0,
      delayMs: 0,
      dropSendAck: 0,
      inputRequired: false,
      failNext: false,
      sawAuthorization: false,
      sends: 0,
      polls: 0,
      created: 0,
      publicUrl: "",
      tasks: [],
    };
  }
}

function save(): void {
  const temporary = `${args.data}.tmp`;
  writeFileSync(temporary, JSON.stringify(store));
  renameSync(temporary, args.data);
}

function send(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(body));
}

function readBody(request: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer) => chunks.push(chunk));
    request.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    request.on("error", reject);
  });
}

function parseObject(body: string): Record<string, unknown> {
  if (body.length === 0) {
    return {};
  }
  const parsed = JSON.parse(body) as unknown;
  return isRecord(parsed) ? parsed : {};
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseArgs(argv: readonly string[]): { port: number; data: string; delayMs: number } {
  let port = 8788;
  let data = "";
  let delayMs = 0;
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    const next = argv[index + 1];
    if (flag === "--port" && next !== undefined) {
      port = Number(next);
      index += 1;
    } else if (flag === "--data" && next !== undefined) {
      data = next;
      index += 1;
    } else if (flag === "--delay-ms" && next !== undefined) {
      delayMs = Number(next);
      index += 1;
    }
  }
  if (data.length === 0 || !Number.isInteger(port) || port < 0) {
    throw new Error("Pass --data and --port.");
  }
  return { port, data, delayMs };
}
