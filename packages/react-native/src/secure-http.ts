import { NativeModules } from "react-native";

import type { SecureHttp, SecureHttpRequestInput, SecureHttpResult } from "@larkxai/host";

interface NativeHttpModule {
  request(requestId: number, payload: string): Promise<string>;
  cancel(requestId: number): void;
}

let nextRequestId = 1;

/**
 * React Native transport. Requests go through LarkXHttp, which rejects
 * redirects in URLSession and HttpURLConnection. A missing module fails the
 * request instead of falling back to fetch, which can follow redirects.
 */
export function createNativeSecureHttp(): SecureHttp {
  return {
    request(input: SecureHttpRequestInput): Promise<SecureHttpResult> {
      const native = NativeModules.LarkXHttp as NativeHttpModule | undefined;
      if (native === undefined || typeof native.request !== "function") {
        return Promise.resolve({ ok: false, error: "network" });
      }
      if (input.signal.aborted) {
        return Promise.resolve({ ok: false, error: "cancelled" });
      }
      const requestId = nextRequestId;
      nextRequestId += 1;
      const onAbort = (): void => {
        native.cancel(requestId);
      };
      input.signal.addEventListener("abort", onAbort);
      return native
        .request(
          requestId,
          JSON.stringify({
            url: input.url,
            method: input.method,
            headers: input.headers,
            body: input.body ?? null,
            timeoutMs: input.timeoutMs,
            maxBytes: input.maxResponseBytes,
          }),
        )
        .then((encoded) => parseNativeResult(encoded))
        .catch(() => ({
          ok: false as const,
          error: input.signal.aborted ? ("cancelled" as const) : ("network" as const),
        }))
        .finally(() => {
          input.signal.removeEventListener("abort", onAbort);
        });
    },
  };
}

function nativeFailure(
  value: unknown,
): "redirect" | "timeout" | "cancelled" | "network" | "oversized" | "invalid_url" {
  if (
    value === "redirect" ||
    value === "timeout" ||
    value === "cancelled" ||
    value === "network" ||
    value === "oversized" ||
    value === "invalid_url"
  ) {
    return value;
  }
  return "network";
}

function parseNativeResult(encoded: string): SecureHttpResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(encoded) as unknown;
  } catch {
    return { ok: false, error: "network" };
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { ok: false, error: "network" };
  }
  const record = parsed as Record<string, unknown>;
  if (record["ok"] !== true) {
    const status = record["status"];
    return {
      ok: false,
      error: nativeFailure(record["error"]),
      ...(typeof status === "number" ? { status } : {}),
    };
  }
  const headers: Record<string, string> = {};
  const rawHeaders = record["headers"];
  if (rawHeaders !== null && typeof rawHeaders === "object" && !Array.isArray(rawHeaders)) {
    for (const [key, value] of Object.entries(rawHeaders)) {
      if (typeof value === "string") {
        headers[key.toLowerCase()] = value;
      }
    }
  }
  return {
    ok: true,
    status: typeof record["status"] === "number" ? record["status"] : 0,
    headers,
    body: typeof record["body"] === "string" ? record["body"] : "",
  };
}
