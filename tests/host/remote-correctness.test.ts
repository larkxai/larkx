import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { once } from "node:events";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  HTTP_REMOTE_CAPABILITIES,
  linkAbortSignal,
  normalizeEndpoint,
  performHttpDelegation,
  remoteAgent,
  resolvedCapabilities,
  transportId,
  type RemoteHttpTransport,
} from "@larkxai/host";
import { createRuntime, scriptedModel, sqlite, type Runtime } from "@larkxai/node";
import { describe, expect, it } from "vitest";

describe("remote delegation correctness", () => {
  it("keeps omitted dedupe and lookup off", () => {
    expect(HTTP_REMOTE_CAPABILITIES).toMatchObject({
      dedupe: false,
      lookup: false,
      taskId: true,
      poll: true,
      cancel: true,
      persistent: true,
    });
    expect(resolvedCapabilities({ cancel: false })).toMatchObject({
      dedupe: false,
      lookup: false,
      cancel: false,
      poll: true,
    });
    expect(resolvedCapabilities({ dedupe: true, lookup: true })).toMatchObject({
      dedupe: true,
      lookup: true,
    });
    const declared = remoteAgent({
      name: "procurement-agent",
      description: "Find compatible replacement parts.",
      transport: {
        type: "http",
        endpoint: "http://127.0.0.1:8787",
        capabilities: { cancel: false },
      },
    });
    expect(declared.transport.capabilities).toMatchObject({
      dedupe: false,
      lookup: false,
      cancel: false,
    });
  });

  it("parses endpoints the same way the runtime stores them", () => {
    expect(normalizeEndpoint(" http://127.0.0.1:8787/ ")).toBe("http://127.0.0.1:8787");
    expect(normalizeEndpoint("http://127.0.0.1:8787\n")).toBe("http://127.0.0.1:8787");
    expect(transportId(normalizeEndpoint(" http://127.0.0.1:8787/ "))).toBe(
      "http:http://127.0.0.1:8787",
    );
    expect(normalizeEndpoint("http://127.0.0.1:8787/tasks/")).toBe("http://127.0.0.1:8787/tasks/");
    expect(() => normalizeEndpoint("http://user:pass@127.0.0.1:8787")).toThrow(/credentials/);
    expect(() => normalizeEndpoint("http://127.0.0.1:8787?x=1")).toThrow(/query/);
    expect(() => normalizeEndpoint("http://127.0.0.1:8787#frag")).toThrow(/fragment/);
    expect(() => normalizeEndpoint("http://127.0.0.1:8787/a b")).toThrow(/whitespace/);
    expect(() => normalizeEndpoint("\vhttp://127.0.0.1:8787")).toThrow(/http or https/);
    expect(() => normalizeEndpoint("http://127.0.0.1:8787/\f")).toThrow(/whitespace/);
    expect(() => normalizeEndpoint("ftp://127.0.0.1:8787")).toThrow(/http or https/);
    expect(() =>
      remoteAgent({
        name: "procurement-agent",
        description: "Find compatible replacement parts.",
        transport: { type: "http", endpoint: "http://127.0.0.1:8787#frag" },
      }),
    ).toThrow(/fragment/);
  });

  it("does not follow a redirect or send credentials to the next hop", async () => {
    const leaked: string[] = [];
    const evil = createServer((request, response) => {
      void readBody(request).then((body) => {
        leaked.push(record(request, body));
        respondJson(response, 200, { taskId: "task-evil", status: "accepted" });
      });
    });
    const evilPort = await listen(evil);
    const seen: string[] = [];
    const peer = createServer((request, response) => {
      void readBody(request).then((body) => {
        seen.push(record(request, body));
        response.writeHead(302, { location: `http://127.0.0.1:${String(evilPort)}/tasks` });
        response.end();
      });
    });
    const port = await listen(peer);
    const endpoint = `http://127.0.0.1:${String(port)}`;
    const report = await performHttpDelegation({
      command: command(endpoint),
      transport: transportFor(endpoint),
      signal: new AbortController().signal,
      online: () => true,
    });
    expect(report.outcome).toBe("temporary");
    expect(report.taskId).toBeUndefined();
    expect(seen).toHaveLength(1);
    expect(seen[0]).toContain("authorization=Bearer secret-token");
    expect(seen[0]).toContain("secret objective");
    expect(leaked).toEqual([]);
    await closeServer(peer);
    await closeServer(evil);
  });

  it("cancels with AbortController and times out without AbortSignal.timeout", async () => {
    const hits: string[] = [];
    const hanging = createServer((request) => {
      hits.push(`${request.method ?? ""} ${request.url ?? ""}`);
    });
    const port = await listen(hanging);
    const endpoint = `http://127.0.0.1:${String(port)}`;
    const cancelled = new AbortController();
    cancelled.abort();
    const notSent = await performHttpDelegation({
      command: command(endpoint),
      transport: transportFor(endpoint, 1_000),
      signal: cancelled.signal,
      online: () => true,
    });
    expect(notSent.outcome).toBe("not_sent");
    expect(hits).toEqual([]);

    const parent = new AbortController();
    const pending = performHttpDelegation({
      command: command(endpoint),
      transport: transportFor(endpoint, 5_000),
      signal: parent.signal,
      online: () => true,
    });
    setTimeout(() => parent.abort(), 20);
    expect(await pending).toMatchObject({ outcome: "timeout" });

    const started = Date.now();
    const timedOut = await performHttpDelegation({
      command: command(endpoint),
      transport: transportFor(endpoint, 40),
      signal: new AbortController().signal,
      online: () => true,
    });
    expect(timedOut.outcome).toBe("timeout");
    expect(Date.now() - started).toBeLessThan(1_000);
    await closeServer(hanging);
  });

  it("stops a cleared timer from aborting a later request", async () => {
    const parent = new AbortController();
    const linked = linkAbortSignal(parent.signal, 1_000);
    parent.abort();
    expect(linked.signal.aborted).toBe(true);
    linked.stop();

    const timed = linkAbortSignal(new AbortController().signal, 20);
    await delay(60);
    expect(timed.signal.aborted).toBe(true);

    const stopped = linkAbortSignal(new AbortController().signal, 20);
    stopped.stop();
    await delay(60);
    expect(stopped.signal.aborted).toBe(false);
  });

  it("does not fail an uncertain submission after repeated invalid responses", async () => {
    let hits = 0;
    const peer = createServer((request, response) => {
      void readBody(request).then(() => {
        hits += 1;
        response.writeHead(200, { "content-type": "application/json" });
        response.end("not-json");
      });
    });
    const port = await listen(peer);
    const directory = mkdtempSync(join(tmpdir(), "larkx-remote-invalid-"));
    const runtime = await createRuntime({
      storage: sqlite(join(directory, "agent.db")),
      ownerId: "field-assistant",
      leaseMs: 0,
    });
    const blocked = waitForReconcile(runtime);
    const agent = runtime.createAgent({
      name: "field-assistant",
      version: 1,
      model: inspectionModel(),
      instructions: "Inspect equipment.",
      remoteAgents: [
        remoteAgent({
          name: "procurement-agent",
          description: "Find compatible replacement parts.",
          transport: {
            type: "http",
            endpoint: `http://127.0.0.1:${String(port)}`,
            pollIntervalMs: 50,
            capabilities: {
              dedupe: false,
              lookup: true,
              taskId: true,
              poll: true,
              cancel: false,
              persistent: true,
            },
          },
        }),
      ],
    });
    const run = await agent.start({ message: "Inspect pump P-104" });
    const pending = run.result().then(
      () => undefined,
      () => undefined,
    );
    await blocked;
    expect(hits).toBe(3);
    const delegations = await run.getDelegations();
    expect(delegations[0]?.state).toBe("UNKNOWN_OUTCOME");
    expect(delegations[0]?.taskId).toBeNull();
    const operationId = delegations[0]?.operationId ?? "";
    expect(operationId.startsWith("op-")).toBe(true);
    await runtime.close();
    await pending;
    await closeServer(peer);
  });

  it("keeps polling a known task through invalid responses", async () => {
    let polls = 0;
    const peer = createServer((request, response) => {
      void readBody(request).then(() => {
        if (request.method === "POST") {
          respondJson(response, 202, { taskId: "task-7", status: "accepted" });
          return;
        }
        polls += 1;
        if (polls < 4) {
          response.writeHead(200, { "content-type": "application/json" });
          response.end("not-json");
          return;
        }
        respondJson(response, 200, {
          taskId: "task-7",
          status: "completed",
          result: { supplier: "Example Industrial Supply" },
        });
      });
    });
    const port = await listen(peer);
    const directory = mkdtempSync(join(tmpdir(), "larkx-remote-working-"));
    const runtime = await createRuntime({
      storage: sqlite(join(directory, "agent.db")),
      ownerId: "field-assistant",
      leaseMs: 0,
    });
    const agent = runtime.createAgent({
      name: "field-assistant",
      version: 1,
      model: inspectionModel(),
      instructions: "Inspect equipment.",
      remoteAgents: [
        remoteAgent({
          name: "procurement-agent",
          description: "Find compatible replacement parts.",
          transport: {
            type: "http",
            endpoint: `http://127.0.0.1:${String(port)}`,
            pollIntervalMs: 50,
          },
        }),
      ],
    });
    const run = await agent.start({ message: "Inspect pump P-104" });
    expect((await run.result()).message).toBe("Done.");
    const delegations = await run.getDelegations();
    expect(delegations[0]?.state).toBe("COMPLETED");
    expect(delegations[0]?.taskId).toBe("task-7");
    expect(delegations[0]?.operationId.startsWith("op-")).toBe(true);
    expect(delegations[0]?.operationId).not.toBe("task-7");
    expect(polls).toBeGreaterThanOrEqual(4);
    await runtime.close();
    await closeServer(peer);
  });

  it("blocks a redirected submission and does not contact the redirect target", async () => {
    const leaked: string[] = [];
    const evil = createServer((request, response) => {
      void readBody(request).then((body) => {
        leaked.push(record(request, body));
        respondJson(response, 200, { taskId: "task-evil", status: "accepted" });
      });
    });
    const evilPort = await listen(evil);
    let posts = 0;
    const peer = createServer((request, response) => {
      void readBody(request).then(() => {
        posts += 1;
        response.writeHead(302, { location: `http://127.0.0.1:${String(evilPort)}/stolen` });
        response.end();
      });
    });
    const port = await listen(peer);
    const directory = mkdtempSync(join(tmpdir(), "larkx-remote-redirect-"));
    const runtime = await createRuntime({
      storage: sqlite(join(directory, "agent.db")),
      ownerId: "field-assistant",
      leaseMs: 0,
    });
    const blocked = waitForReconcile(runtime);
    const agent = runtime.createAgent({
      name: "field-assistant",
      version: 1,
      model: inspectionModel(),
      instructions: "Inspect equipment.",
      remoteAgents: [
        remoteAgent({
          name: "procurement-agent",
          description: "Find compatible replacement parts.",
          transport: {
            type: "http",
            endpoint: `http://127.0.0.1:${String(port)}`,
            pollIntervalMs: 50,
            headers: () => ({ authorization: "Bearer secret-token" }),
          },
        }),
      ],
    });
    const run = await agent.start({ message: "Inspect pump P-104" });
    const pending = run.result().then(
      () => undefined,
      () => undefined,
    );
    await blocked;
    expect(posts).toBe(1);
    expect(leaked).toEqual([]);
    expect((await run.getDelegations())[0]?.state).toBe("UNKNOWN_OUTCOME");
    await runtime.close();
    await pending;
    await closeServer(peer);
    await closeServer(evil);
  });
});

function transportFor(endpoint: string, timeoutMs = 1_000): RemoteHttpTransport {
  return remoteAgent({
    name: "procurement-agent",
    description: "Find compatible replacement parts.",
    transport: {
      type: "http",
      endpoint,
      timeoutMs,
      headers: () => ({ authorization: "Bearer secret-token" }),
    },
  }).transport;
}

function command(endpoint: string) {
  return {
    action: "submit" as const,
    endpoint,
    input: { objective: "secret objective" },
    operationId: "op-redirect",
    pollIntervalMs: 50,
    remoteAgent: "procurement-agent",
    transportId: transportId(endpoint),
  };
}

function inspectionModel() {
  return scriptedModel([
    {
      message: null,
      finish: "tool_calls",
      calls: [
        {
          id: "remote-1",
          name: "procurement-agent",
          arguments: { objective: "secret objective" },
        },
      ],
    },
    { message: "Done.", finish: "stop", calls: [] },
  ]);
}

function waitForReconcile(runtime: Runtime): Promise<void> {
  return new Promise((resolve) => {
    runtime.observe((event) => {
      if (event.type === "reconcile-required") {
        resolve();
      }
    });
  });
}

function record(request: IncomingMessage, body: string): string {
  return `${request.method ?? ""} ${request.url ?? ""} authorization=${request.headers.authorization ?? ""} ${body}`;
}

function respondJson(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(body));
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

async function listen(server: Server): Promise<number> {
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (address === null || typeof address === "string") {
    throw new Error("The test server did not bind a port.");
  }
  return address.port;
}

function closeServer(server: Server): Promise<void> {
  server.closeAllConnections();
  return new Promise((resolve, reject) => {
    server.close((error) => {
      if (error !== undefined) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}
