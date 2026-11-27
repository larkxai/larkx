/**
 * Internal HTTP contract shared by the Node host and the React Native native
 * modules. It is not a general-purpose client. Callers pass an authorized URL
 * and receive one response, or a structured failure. Redirects are not followed.
 */
export type SecureHttpMethod = "GET" | "POST";

export type SecureHttpFailure =
  "redirect" | "timeout" | "cancelled" | "network" | "oversized" | "invalid_url";

export interface SecureHttpRequestInput {
  readonly url: string;
  readonly method: SecureHttpMethod;
  readonly headers: Readonly<Record<string, string>>;
  readonly body?: string;
  readonly timeoutMs: number;
  readonly signal: AbortSignal;
  readonly maxResponseBytes: number;
}

export type SecureHttpResult =
  | {
      readonly ok: true;
      readonly status: number;
      readonly headers: Readonly<Record<string, string>>;
      readonly body: string;
    }
  | { readonly ok: false; readonly error: SecureHttpFailure; readonly status?: number };

export interface SecureHttp {
  request(input: SecureHttpRequestInput): Promise<SecureHttpResult>;
}

export function secureFailure(error: SecureHttpFailure): Error {
  const message =
    error === "timeout"
      ? "The request timed out."
      : error === "cancelled"
        ? "The request was cancelled."
        : error === "oversized"
          ? "The response exceeded the size limit."
          : error === "invalid_url"
            ? "The endpoint is not a supported URL."
            : error === "redirect"
              ? "The redirect was not followed."
              : "The network request failed.";
  const failure = new Error(message);
  if (error === "timeout" || error === "cancelled") {
    failure.name = "AbortError";
  }
  return failure;
}
