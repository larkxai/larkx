import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { once } from "node:events";

import { createNodeSecureHttp } from "@larkxai/node";
import { describe, expect, it } from "vitest";

/**
 * These tests drive the Node transport with real sockets.
 * The iOS URLSession module and the Android HttpURLConnection module implement
 * the same redirect, timeout, and cancellation contract. This environment has
 * no iOS simulator and no Android emulator, so those modules are not executed here.
 */
describe("node secure http", () => {
  const http = createNodeSecureHttp();

  it("returns a successful response", async () => {
    const server = await listen((request, response) => {
      response.writeHead(200, { "content-type": "application/json" });
      response.end('{"ok":true}');
      void request;
    });
    const result = await http.request(input(server.url, { method: "GET" }));
    expect(result).toMatchObject({ ok: true, status: 200, body: '{"ok":true}' });
    await close(server.server);
  });

  it.each([301, 302, 303, 307, 308])(
    "rejects HTTP %s before a second hop sees the credential or body",
    async (status) => {
      const leaked: string[] = [];
      const seen: string[] = [];
      const next = await listen(async (request, response) => {
        leaked.push(
          `${request.method ?? ""} ${header(request, "authorization")} ${await readBody(request)}`,
        );
        response.writeHead(200);
        response.end("stolen");
      });
      const origin = await listen(async (request, response) => {
        seen.push(
          `${request.method ?? ""} ${header(request, "authorization")} ${await readBody(request)}`,
        );
        response.writeHead(status, { location: `${next.url}/taken` });
        response.end();
      });
      const result = await http.request(
        input(origin.url, {
          method: "POST",
          headers: { authorization: "Bearer secret-token" },
          body: "private-context",
        }),
      );
      expect(result).toMatchObject({ ok: false, error: "redirect", status });
      expect(seen).toEqual(["POST Bearer secret-token private-context"]);
      expect(leaked).toEqual([]);
      await close(origin.server);
      await close(next.server);
    },
  );

  it("rejects a same-origin redirect without requesting the next path", async () => {
    let requests = 0;
    const server = await listen((request, response) => {
      requests += 1;
      void readBody(request).then(() => {
        response.writeHead(302, { location: "/next" });
        response.end();
      });
    });
    const result = await http.request(
      input(server.url, {
        method: "POST",
        headers: { authorization: "Bearer secret-token" },
        body: "private-context",
      }),
    );
    expect(result).toMatchObject({ ok: false, error: "redirect", status: 302 });
    expect(requests).toBe(1);
    await close(server.server);
  });

  it("times out a request that never responds", async () => {
    const server = await listen(() => undefined);
    const result = await http.request(input(server.url, { method: "GET", timeoutMs: 50 }));
    expect(result).toEqual({ ok: false, error: "timeout" });
    await close(server.server);
  });

  it("cancels the socket and ignores a late response", async () => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const server = await listen(async (request, response) => {
      await gate;
      response.writeHead(200);
      response.end("late");
      void request;
    });
    const controller = new AbortController();
    const pending = http.request(input(server.url, { method: "GET", signal: controller.signal }));
    await new Promise((resolve) => setTimeout(resolve, 20));
    controller.abort();
    release();
    await expect(pending).resolves.toEqual({ ok: false, error: "cancelled" });
    await close(server.server);
  });

  it("stops reading an oversized response", async () => {
    const server = await listen((_request, response) => {
      response.writeHead(200);
      response.end("x".repeat(8_000));
    });
    const result = await http.request(input(server.url, { method: "GET", maxResponseBytes: 100 }));
    expect(result).toEqual({ ok: false, error: "oversized" });
    await close(server.server);
  });

  it("rejects unsupported URLs and embedded credentials", async () => {
    const controller = new AbortController();
    await expect(
      http.request({
        url: "file:///tmp/larkx",
        method: "GET",
        headers: {},
        timeoutMs: 1000,
        signal: controller.signal,
        maxResponseBytes: 100,
      }),
    ).resolves.toEqual({ ok: false, error: "invalid_url" });
    await expect(
      http.request({
        url: "http://user:secret@127.0.0.1/agent",
        method: "GET",
        headers: {},
        timeoutMs: 1000,
        signal: controller.signal,
        maxResponseBytes: 100,
      }),
    ).resolves.toEqual({ ok: false, error: "invalid_url" });
  });
});

function input(
  url: string,
  overrides: {
    readonly method?: "GET" | "POST";
    readonly headers?: Record<string, string>;
    readonly body?: string;
    readonly timeoutMs?: number;
    readonly signal?: AbortSignal;
    readonly maxResponseBytes?: number;
  },
) {
  return {
    url,
    method: overrides.method ?? "GET",
    headers: overrides.headers ?? {},
    ...(overrides.body === undefined ? {} : { body: overrides.body }),
    timeoutMs: overrides.timeoutMs ?? 1_000,
    signal: overrides.signal ?? new AbortController().signal,
    maxResponseBytes: overrides.maxResponseBytes ?? 65_536,
  };
}

function header(request: IncomingMessage, name: string): string {
  const value = request.headers[name];
  return Array.isArray(value) ? value.join(",") : (value ?? "");
}

function readBody(request: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer) => chunks.push(chunk));
    request.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    request.on("error", reject);
  });
}

async function listen(
  handler: (request: IncomingMessage, response: ServerResponse) => void | Promise<void>,
): Promise<{ readonly server: Server; readonly url: string }> {
  const server = createServer((request, response) => {
    void Promise.resolve(handler(request, response)).catch(() => {
      response.destroy();
    });
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (address === null || typeof address === "string") {
    throw new Error("The fixture server did not bind.");
  }
  return { server, url: `http://127.0.0.1:${String(address.port)}` };
}

function close(server: Server): Promise<void> {
  server.closeAllConnections();
  return new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}
