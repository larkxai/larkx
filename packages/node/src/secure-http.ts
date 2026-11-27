import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";

import type { SecureHttp, SecureHttpRequestInput, SecureHttpResult } from "@larkxai/host";

/**
 * Node transport for SDK-managed requests. It does not follow redirects, does
 * not send cookies of its own, and completes the promise exactly once.
 */
export function createNodeSecureHttp(): SecureHttp {
  return { request: nodeRequest };
}

function nodeRequest(input: SecureHttpRequestInput): Promise<SecureHttpResult> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (result: SecureHttpResult): void => {
      if (settled) {
        return;
      }
      settled = true;
      resolve(result);
    };
    let target: URL;
    try {
      target = new URL(input.url);
    } catch {
      finish({ ok: false, error: "invalid_url" });
      return;
    }
    if (
      (target.protocol !== "http:" && target.protocol !== "https:") ||
      target.username.length > 0 ||
      target.password.length > 0
    ) {
      finish({ ok: false, error: "invalid_url" });
      return;
    }
    const send = target.protocol === "https:" ? httpsRequest : httpRequest;
    const request = send(
      target,
      {
        method: input.method,
        headers: { ...input.headers },
        timeout: input.timeoutMs,
      },
      (response) => {
        const status = response.statusCode ?? 0;
        if (status >= 300 && status < 400) {
          response.resume();
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
    const fail = (error: SecureHttpResult): void => {
      request.destroy();
      finish(error);
    };
    if (input.signal.aborted) {
      fail({ ok: false, error: "cancelled" });
      return;
    }
    input.signal.addEventListener(
      "abort",
      () => {
        fail({ ok: false, error: "cancelled" });
      },
      { once: true },
    );
    request.on("timeout", () => {
      fail({ ok: false, error: "timeout" });
    });
    request.on("error", () => {
      finish({ ok: false, error: input.signal.aborted ? "cancelled" : "network" });
    });
    if (input.body !== undefined) {
      request.write(input.body);
    }
    request.end();
  });
}
