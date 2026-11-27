import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";

import type { SecureHttp, SecureHttpRequestInput, SecureHttpResult } from "@larkxai/host";

/**
 * Node transport for SDK-managed requests. It does not follow redirects, does
 * not send cookies of its own, and completes the promise exactly once.
 * `timeoutMs` is a wall-clock deadline for the socket operation. It is not
 * reset when response bytes arrive.
 */
export function createNodeSecureHttp(): SecureHttp {
  return { request: nodeRequest };
}

function nodeRequest(input: SecureHttpRequestInput): Promise<SecureHttpResult> {
  return new Promise((resolve) => {
    let settled = false;
    const clock: { timer?: ReturnType<typeof setTimeout> } = {};
    const finish = (result: SecureHttpResult): void => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(clock.timer);
      resolve(result);
    };
    const target = parseTarget(input.url);
    if (target === null) {
      finish({ ok: false, error: "invalid_url" });
      return;
    }
    if (input.signal.aborted) {
      finish({ ok: false, error: "cancelled" });
      return;
    }
    const send = target.protocol === "https:" ? httpsRequest : httpRequest;
    const request = send(
      target,
      {
        method: input.method,
        headers: { ...input.headers },
      },
      (response) => {
        const status = response.statusCode ?? 0;
        if (status >= 300 && status < 400) {
          response.resume();
          request.destroy();
          finish({ ok: false, error: "redirect", status });
          return;
        }
        const chunks: Buffer[] = [];
        let size = 0;
        response.on("data", (chunk: Buffer) => {
          size += chunk.length;
          if (size > input.maxResponseBytes) {
            response.destroy();
            finish({ ok: false, error: "oversized" });
            return;
          }
          chunks.push(chunk);
        });
        response.on("end", () => {
          const headers: Record<string, string> = {};
          for (const [key, value] of Object.entries(response.headers)) {
            if (typeof value === "string") {
              headers[key.toLowerCase()] = value;
            } else if (Array.isArray(value)) {
              headers[key.toLowerCase()] = value.join(", ");
            }
          }
          finish({
            ok: true,
            status,
            headers,
            body: Buffer.concat(chunks).toString("utf8"),
          });
        });
        response.on("error", () => {
          finish({ ok: false, error: input.signal.aborted ? "cancelled" : "network" });
        });
      },
    );
    clock.timer = setTimeout(() => {
      request.destroy();
      finish({ ok: false, error: "timeout" });
    }, input.timeoutMs);
    input.signal.addEventListener(
      "abort",
      () => {
        request.destroy();
        finish({ ok: false, error: "cancelled" });
      },
      { once: true },
    );
    request.on("error", () => {
      finish({ ok: false, error: input.signal.aborted ? "cancelled" : "network" });
    });
    if (input.body !== undefined) {
      request.write(input.body);
    }
    request.end();
  });
}

function parseTarget(url: string): URL | null {
  try {
    const target = new URL(url);
    if (
      (target.protocol !== "http:" && target.protocol !== "https:") ||
      target.username.length > 0 ||
      target.password.length > 0
    ) {
      return null;
    }
    return target;
  } catch {
    return null;
  }
}
