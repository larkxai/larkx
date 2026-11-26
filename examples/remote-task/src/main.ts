import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFileSync, renameSync, writeFileSync } from "node:fs";

/**
 * Development fixture for the HTTP task protocol.
 * It is not a LarkX product and it does not run an agent loop.
 * Supplier recommendations are simulated and labeled as such.
 *
 * This process supports dedupe, lookup, durable task ids, poll, cancel, and
 * persistence. Callers declare those capabilities. This server does not.
 */

interface Task {
  taskId: string;
  operationId: string;
  input: unknown;
  canonicalInput: string;
  status: "accepted" | "working" | "completed" | "failed" | "cancelled";
  fail: boolean;
  readyAt: number;
  result?: unknown;
}

interface Store {
  next: number;
  delayMs: number;
  dropNextAck: boolean;
  failNext: boolean;
  sawAuthorization: boolean;
  posts: number;
  created: number;
  tasks: Task[];
}

const args = parseArgs(process.argv.slice(2));
const store = load(args.data);

const server = createServer((request, response) => {
  void handle(request, response).catch((error: unknown) => {
    send(response, 500, {
      status: "failed",
      message: error instanceof Error ? error.message : "fixture error",
    });
  });
});

server.listen(args.port, "0.0.0.0", () => {
  process.stdout.write(`${JSON.stringify({ ready: true, port: args.port, simulated: true })}\n`);
});

async function handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
  const url = new URL(request.url ?? "/", "http://127.0.0.1");
  const body = await readBody(request);
  if (authorizationSeen(request)) {
    store.sawAuthorization = true;
    save();
  }
  if (request.method === "GET" && url.pathname === "/_tasks") {
    send(response, 200, publicStore());
    return;
  }
  if (request.method === "POST" && url.pathname === "/_control") {
    const control = parseObject(body);
    if (
      typeof control.delayMs === "number" &&
      Number.isInteger(control.delayMs) &&
      control.delayMs >= 0
    ) {
      store.delayMs = control.delayMs;
    }
    if (control.dropNextAck === true) {
      store.dropNextAck = true;
    }
    if (control.failNext === true) {
      store.failNext = true;
    }
    save();
    send(response, 200, { ok: true, simulated: true });
    return;
  }
  if (request.method === "POST" && url.pathname === "/tasks") {
    submit(response, body);
    return;
  }
  const taskMatch = /^\/tasks\/([^/]+)$/.exec(url.pathname);
  if (request.method === "GET" && taskMatch?.[1] !== undefined) {
    poll(response, decodeURIComponent(taskMatch[1]));
    return;
  }
  const cancelMatch = /^\/tasks\/([^/]+)\/cancel$/.exec(url.pathname);
  if (request.method === "POST" && cancelMatch?.[1] !== undefined) {
    cancel(response, decodeURIComponent(cancelMatch[1]));
    return;
  }
  const operationMatch = /^\/operations\/([^/]+)$/.exec(url.pathname);
  if (request.method === "GET" && operationMatch?.[1] !== undefined) {
    lookup(response, decodeURIComponent(operationMatch[1]));
    return;
  }
  send(response, 404, { status: "failed", message: "Not found." });
}

function submit(response: ServerResponse, body: string): void {
  store.posts += 1;
  const parsed = parseObject(body);
  const operationId = parsed.operationId;
  const input = parsed.input;
  if (typeof operationId !== "string" || operationId.length === 0 || input === undefined) {
    save();
    send(response, 400, { status: "failed", message: "operationId and input are required." });
    return;
  }
  const canonicalInput = canonical(input);
  const existing = store.tasks.find((task) => task.operationId === operationId);
  if (existing !== undefined) {
    if (existing.canonicalInput !== canonicalInput) {
      save();
      send(response, 409, {
        status: "failed",
        operationId,
        message: "A different payload is already stored for this operation id.",
      });
      return;
    }
    save();
    if (store.dropNextAck) {
      store.dropNextAck = false;
      save();
      response.destroy();
      return;
    }
    send(response, 200, { taskId: existing.taskId, status: "accepted", operationId });
    return;
  }
  store.next += 1;
  store.created += 1;
  const task: Task = {
    taskId: `task-${String(store.next)}`,
    operationId,
    input,
    canonicalInput,
    status: "accepted",
    fail: store.failNext,
    readyAt: Date.now() + store.delayMs,
  };
  store.failNext = false;
  store.tasks.push(task);
  save();
  if (store.dropNextAck) {
    store.dropNextAck = false;
    save();
    response.destroy();
    return;
  }
  send(response, 202, { taskId: task.taskId, status: "accepted", operationId });
}

function poll(response: ServerResponse, taskId: string): void {
  const task = store.tasks.find((item) => item.taskId === taskId);
  if (task === undefined) {
    send(response, 404, { status: "failed", message: "The remote task was not found." });
    return;
  }
  send(response, 200, view(task));
}

function lookup(response: ServerResponse, operationId: string): void {
  const task = store.tasks.find((item) => item.operationId === operationId);
  if (task === undefined) {
    send(response, 404, { status: "failed", operationId, message: "The operation was not found." });
    return;
  }
  send(response, 200, { ...view(task), operationId });
}

function cancel(response: ServerResponse, taskId: string): void {
  const task = store.tasks.find((item) => item.taskId === taskId);
  if (task === undefined) {
    send(response, 404, { status: "failed", message: "The remote task was not found." });
    return;
  }
  if (task.status !== "completed" && task.status !== "failed" && task.status !== "cancelled") {
    task.status = "cancelled";
    save();
  }
  send(response, 200, view(task));
}

function view(task: Task): {
  taskId: string;
  status: string;
  result?: unknown;
  message?: string;
  simulated: true;
} {
  if (task.status === "cancelled") {
    return {
      taskId: task.taskId,
      status: "cancelled",
      simulated: true,
      message: "Cancelled by the client.",
    };
  }
  if (task.status === "failed" || (task.fail && Date.now() >= task.readyAt)) {
    task.status = "failed";
    save();
    return {
      taskId: task.taskId,
      status: "failed",
      simulated: true,
      message: "Simulated supplier search failure.",
    };
  }
  if (Date.now() < task.readyAt) {
    return { taskId: task.taskId, status: "working", simulated: true };
  }
  task.status = "completed";
  task.result = simulatedResult(task.input);
  save();
  return { taskId: task.taskId, status: "completed", result: task.result, simulated: true };
}

function simulatedResult(input: unknown): unknown {
  const record =
    typeof input === "object" && input !== null ? (input as { readonly component?: unknown }) : {};
  const component = typeof record.component === "string" ? record.component : "replacement part";
  return {
    simulated: true,
    recommendations: [
      {
        supplier: "Example Industrial Supply",
        part: `Compatible ${component}`,
        estimatedPrice: 240,
        simulated: true,
      },
    ],
  };
}

function publicStore(): unknown {
  return {
    simulated: true,
    posts: store.posts,
    created: store.created,
    sawAuthorization: store.sawAuthorization,
    tasks: store.tasks.map((task) => ({
      taskId: task.taskId,
      operationId: task.operationId,
      status: task.status,
      input: task.input,
      simulated: true,
    })),
  };
}

function authorizationSeen(request: IncomingMessage): boolean {
  const header = request.headers.authorization;
  return header === "Bearer secret-token";
}

function send(response: ServerResponse, status: number, body: unknown): void {
  const encoded = JSON.stringify(body);
  response.writeHead(status, { "content-type": "application/json" });
  response.end(encoded);
}

function readBody(request: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer) => {
      chunks.push(chunk);
    });
    request.on("end", () => {
      resolve(Buffer.concat(chunks).toString("utf8"));
    });
    request.on("error", reject);
  });
}

function parseObject(body: string): { readonly [key: string]: unknown } {
  if (body.trim().length === 0) {
    return {};
  }
  const parsed = JSON.parse(body) as unknown;
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("JSON object required.");
  }
  return parsed as { readonly [key: string]: unknown };
}

function canonical(value: unknown): string {
  return JSON.stringify(sortValue(value));
}

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => sortValue(item));
  }
  if (typeof value === "object" && value !== null) {
    const record = value as { readonly [key: string]: unknown };
    const sorted: { [key: string]: unknown } = {};
    for (const key of Object.keys(record).sort()) {
      sorted[key] = sortValue(record[key]);
    }
    return sorted;
  }
  return value;
}

function load(path: string): Store {
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as Store;
    if (!Array.isArray(parsed.tasks)) {
      throw new Error("bad store");
    }
    return parsed;
  } catch {
    return {
      next: 0,
      delayMs: args.delayMs,
      dropNextAck: false,
      failNext: false,
      sawAuthorization: false,
      posts: 0,
      created: 0,
      tasks: [],
    };
  }
}

function save(): void {
  const temporary = `${args.data}.tmp`;
  writeFileSync(temporary, JSON.stringify(store));
  renameSync(temporary, args.data);
}

function parseArgs(argv: readonly string[]): { port: number; data: string; delayMs: number } {
  let port = 8787;
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
  if (
    !Number.isInteger(port) ||
    port < 1 ||
    data.length === 0 ||
    !Number.isInteger(delayMs) ||
    delayMs < 0
  ) {
    throw new Error("Pass --port, --data, and an optional --delay-ms.");
  }
  return { port, data, delayMs };
}
