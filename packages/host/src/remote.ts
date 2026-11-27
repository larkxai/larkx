import type { JsonValue } from "@larkxai/protocol";
import { LarkxError } from "@larkxai/protocol";

import { secureFailure, type SecureHttp } from "./secure-http.js";

/**
 * Capabilities a remote adapter declares. The runtime stores these with the
 * delegation and uses that copy during recovery. A later registration cannot
 * widen them. An Idempotency-Key header does not prove the peer deduplicates.
 */
export interface RemoteCapabilities {
  readonly dedupe: boolean;
  readonly lookup: boolean;
  readonly taskId: boolean;
  readonly poll: boolean;
  readonly cancel: boolean;
  readonly persistent: boolean;
}

/**
 * Defaults for an arbitrary HTTP endpoint. Dedupe and lookup stay off until the
 * caller declares them. An Idempotency-Key header is not that declaration.
 * `taskId`, `poll`, `cancel`, and `persistent` describe this task protocol and
 * still have to be turned off when a peer does not implement them.
 */
export const HTTP_REMOTE_CAPABILITIES: RemoteCapabilities = {
  dedupe: false,
  lookup: false,
  taskId: true,
  poll: true,
  cancel: true,
  persistent: true,
};

/** Transport timeout used when `timeoutMs` is omitted. */
export const DEFAULT_REMOTE_TIMEOUT_MS = 15_000;

export interface RemoteHttpTransport {
  readonly type: "http";
  /** http or https URL with no userinfo, query, or fragment. */
  readonly endpoint: string;
  readonly capabilities?: Partial<RemoteCapabilities>;
  /** Milliseconds between status polls. 0 uses the runtime default of 1000. */
  readonly pollIntervalMs?: number;
  /**
   * Per-request timeout. Omitted means {@link DEFAULT_REMOTE_TIMEOUT_MS}.
   * The host aborts the request with an AbortController. It does not follow redirects.
   */
  readonly timeoutMs?: number;
  /**
   * Host-resolved request headers. The callback result is not passed to the
   * runtime and is not written to the execution database.
   */
  readonly headers?: (endpoint: string) => Record<string, string> | Promise<Record<string, string>>;
  /**
   * Test hook that replaces `fetch`. Production callers leave this unset.
   * The returned status and body are interpreted with the HTTP task protocol.
   */
  readonly execute?: (request: RemoteHttpCall) => Promise<RemoteHttpResponse>;
}

export interface RemoteHttpCall {
  readonly action: "submit" | "lookup" | "poll" | "cancel";
  readonly method: "GET" | "POST";
  readonly url: string;
  readonly endpoint: string;
  readonly operationId: string;
  readonly taskId?: string;
  readonly body?: string;
  readonly signal: AbortSignal;
}

export interface RemoteHttpResponse {
  readonly status: number;
  readonly body: string;
}

/**
 * A2A protocol 1.0 does not guarantee that a message id is a dedupe key or
 * that a client can look up a submission before it knows the task id.
 * Callers cannot turn those capabilities on.
 */
export const A2A_PROTOCOL_VERSION = "1.0" as const;

export const A2A_REMOTE_CAPABILITIES: RemoteCapabilities = {
  dedupe: false,
  lookup: false,
  taskId: true,
  poll: true,
  cancel: true,
  persistent: true,
};

export interface RemoteA2aTransport {
  readonly type: "a2a";
  /** Authorized JSON-RPC endpoint. An Agent Card cannot replace it. */
  readonly endpoint: string;
  /** Only 1.0 is supported. Omitted means 1.0. */
  readonly protocolVersion?: typeof A2A_PROTOCOL_VERSION;
  /**
   * Fetch and validate the Agent Card before the first submission.
   * The card's JSON-RPC 1.0 interface must be this endpoint.
   */
  readonly discover?: boolean;
  readonly pollIntervalMs?: number;
  readonly timeoutMs?: number;
  readonly headers?: (endpoint: string) => Record<string, string> | Promise<Record<string, string>>;
  /** Test hook that replaces `fetch`. Production callers leave this unset. */
  readonly execute?: (request: RemoteA2aCall) => Promise<RemoteHttpResponse>;
}

export interface RemoteA2aCall {
  readonly action: "discover" | "submit" | "continue" | "poll" | "cancel";
  readonly method: "GET" | "POST";
  readonly url: string;
  readonly endpoint: string;
  readonly operationId: string;
  readonly taskId?: string;
  readonly body?: string;
  readonly signal: AbortSignal;
}

export type RemoteTransport = RemoteHttpTransport | RemoteA2aTransport;

export interface RemoteAgent {
  readonly name: string;
  readonly description: string;
  readonly schema: {
    readonly type: "object";
    readonly properties?: { readonly [key: string]: JsonValue };
    readonly required?: readonly string[];
    readonly additionalProperties?: boolean;
  };
  readonly transport: RemoteTransport;
}

export interface DelegationView {
  readonly cancelIntent: boolean;
  readonly contextId: string | null;
  readonly endpoint: string;
  readonly operationId: string;
  readonly prompt: string | null;
  readonly remoteAgent: string;
  readonly remoteIdentity: string | null;
  readonly remoteStatus: string | null;
  readonly state: string;
  readonly stepKey: string;
  readonly taskId: string | null;
  readonly transport: string;
}

export interface DelegationCommand {
  readonly action: string;
  readonly contextId?: string;
  readonly continuation?: string;
  readonly endpoint: string;
  readonly input: JsonValue;
  readonly operationId: string;
  readonly pollIntervalMs: number;
  readonly remoteAgent: string;
  readonly taskId?: string;
  readonly transport: "http" | "a2a";
  readonly transportId: string;
}

export interface DelegationReport {
  readonly outcome: string;
  readonly taskId?: string;
  readonly contextId?: string;
  readonly remoteStatus?: string;
  readonly remoteIdentity?: string;
  readonly result?: JsonValue;
  readonly message?: string;
}

const AGENT_NAME = /^[a-z][a-z0-9-]{0,63}$/;
const TASK_ID = /^[A-Za-z0-9._:-]{1,128}$/;

export function remoteAgent(definition: {
  readonly name: string;
  readonly description: string;
  readonly schema?: RemoteAgent["schema"];
  readonly transport: RemoteTransport;
}): RemoteAgent {
  if (!AGENT_NAME.test(definition.name)) {
    throw invalid(`Remote agent name "${definition.name}" must match ${AGENT_NAME.source}.`);
  }
  if (definition.description.trim().length === 0) {
    throw invalid(`Remote agent "${definition.name}" needs a description.`);
  }
  if (definition.transport.type !== "http" && definition.transport.type !== "a2a") {
    throw invalid(`Remote agent "${definition.name}" needs an HTTP or A2A transport.`);
  }
  if (
    definition.transport.type === "a2a" &&
    definition.transport.protocolVersion !== undefined &&
    definition.transport.protocolVersion !== A2A_PROTOCOL_VERSION
  ) {
    throw invalid(
      `Remote agent "${definition.name}" only supports A2A protocol ${A2A_PROTOCOL_VERSION}.`,
    );
  }
  const endpoint = normalizeEndpoint(definition.transport.endpoint);
  const schema = definition.schema ?? { type: "object", additionalProperties: true };
  if (schema.type !== "object") {
    throw invalid(`Remote agent "${definition.name}" input schema must be an object.`);
  }
  const interval = definition.transport.pollIntervalMs;
  if (
    interval !== undefined &&
    (!Number.isInteger(interval) ||
      interval < 0 ||
      (interval !== 0 && (interval < 50 || interval > 60_000)))
  ) {
    throw invalid("Remote poll interval must be 0 or between 50 and 60000 milliseconds.");
  }
  const timeoutMs = definition.transport.timeoutMs;
  if (
    timeoutMs !== undefined &&
    (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 120_000)
  ) {
    throw invalid("Remote transport timeout must be from 1 to 120000 milliseconds.");
  }
  return {
    name: definition.name,
    description: definition.description,
    schema,
    transport:
      definition.transport.type === "a2a"
        ? {
            ...definition.transport,
            endpoint,
            protocolVersion: A2A_PROTOCOL_VERSION,
          }
        : {
            ...definition.transport,
            endpoint,
            capabilities: resolvedCapabilities(definition.transport.capabilities),
          },
  };
}

export function resolvedCapabilities(
  partial: Partial<RemoteCapabilities> | undefined,
): RemoteCapabilities {
  return { ...HTTP_REMOTE_CAPABILITIES, ...partial };
}

/** Same character checks as `normalize_endpoint` in the C++ runtime. */
export function endpointHasForbiddenCharacter(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (
      code === 0x09 ||
      code === 0x0a ||
      code === 0x0b ||
      code === 0x0c ||
      code === 0x0d ||
      code === 0x20 ||
      code === 0x23 ||
      code === 0x3f
    ) {
      return true;
    }
  }
  return false;
}

/** Match `trim_copy` in the C++ runtime: space, tab, CR, and LF only. */
function trimEndpoint(value: string): string {
  let begin = 0;
  let end = value.length;
  const trimmable = (code: number): boolean =>
    code === 0x09 || code === 0x0a || code === 0x0d || code === 0x20;
  while (begin < end && trimmable(value.charCodeAt(begin))) {
    begin += 1;
  }
  while (end > begin && trimmable(value.charCodeAt(end - 1))) {
    end -= 1;
  }
  return value.slice(begin, end);
}

/** Match the C++ endpoint rules so the registered destination and the stored one agree. */
export function normalizeEndpoint(endpoint: string): string {
  let value = trimEndpoint(endpoint);
  if (!value.startsWith("https://") && !value.startsWith("http://")) {
    throw invalid("Remote endpoint must be an http or https URL.");
  }
  if (endpointHasForbiddenCharacter(value)) {
    throw invalid("Remote endpoint cannot include whitespace, a query, or a fragment.");
  }
  const rest = value.slice(value.indexOf("://") + 3);
  if (rest.length === 0 || rest.includes("@")) {
    throw invalid("Remote endpoint cannot include URL credentials.");
  }
  const slash = rest.indexOf("/");
  const host = slash === -1 ? rest : rest.slice(0, slash);
  if (host.length === 0 || host.startsWith(":")) {
    throw invalid("Remote endpoint is missing a host.");
  }
  if (slash !== -1 && slash + 1 === rest.length) {
    value = value.slice(0, -1);
  }
  if (value.length > 200) {
    throw invalid("Remote endpoint is too long.");
  }
  return value;
}

export function transportId(transport: {
  readonly type: "http" | "a2a";
  readonly endpoint: string;
}): string {
  return `${transport.type}:${transport.endpoint}`;
}

export async function performHttpDelegation(input: {
  readonly command: DelegationCommand;
  readonly transport: RemoteHttpTransport;
  readonly signal: AbortSignal;
  readonly online: () => boolean | Promise<boolean>;
  readonly http?: SecureHttp;
}): Promise<DelegationReport> {
  const action = input.command.action;
  if (action !== "submit" && action !== "lookup" && action !== "poll" && action !== "cancel") {
    return { outcome: "invalid", message: `Remote action "${action}" is not supported.` };
  }
  if (input.signal.aborted && action === "submit" && input.command.taskId === undefined) {
    return { outcome: "not_sent", message: "Cancelled before the request was sent." };
  }
  if ((await input.online()) === false) {
    return { outcome: "offline", message: "The host reported no network connection." };
  }
  if (input.signal.aborted && action === "submit" && input.command.taskId === undefined) {
    return { outcome: "not_sent", message: "Cancelled before the request was sent." };
  }
  const call = httpCall(input.command, action, input.signal);
  if (input.signal.aborted && action !== "cancel") {
    return { outcome: "timeout", message: "The remote request was aborted." };
  }
  try {
    const response = input.transport.execute
      ? await input.transport.execute(call)
      : await fetchHttp(input.transport, call, input.http);
    return interpretHttp(action, input.command.operationId, response);
  } catch (error) {
    if (isAbort(error) || input.signal.aborted) {
      return { outcome: "timeout", message: "The remote request timed out." };
    }
    return { outcome: "network", message: messageOf(error) };
  }
}

function httpCall(
  command: DelegationCommand,
  action: "submit" | "lookup" | "poll" | "cancel",
  signal: AbortSignal,
): RemoteHttpCall {
  if (action === "submit") {
    return {
      action,
      method: "POST",
      url: `${command.endpoint}/tasks`,
      endpoint: command.endpoint,
      operationId: command.operationId,
      ...(command.taskId !== undefined ? { taskId: command.taskId } : {}),
      body: JSON.stringify({ operationId: command.operationId, input: command.input }),
      signal,
    };
  }
  if (action === "lookup") {
    return {
      action,
      method: "GET",
      url: `${command.endpoint}/operations/${encodeURIComponent(command.operationId)}`,
      endpoint: command.endpoint,
      operationId: command.operationId,
      signal,
    };
  }
  if (command.taskId === undefined || !TASK_ID.test(command.taskId)) {
    throw invalid("A poll or cancel needs the stored remote task id.");
  }
  return {
    action,
    method: action === "poll" ? "GET" : "POST",
    url:
      action === "poll"
        ? `${command.endpoint}/tasks/${encodeURIComponent(command.taskId)}`
        : `${command.endpoint}/tasks/${encodeURIComponent(command.taskId)}/cancel`,
    endpoint: command.endpoint,
    operationId: command.operationId,
    taskId: command.taskId,
    ...(action === "cancel" ? { body: JSON.stringify({ operationId: command.operationId }) } : {}),
    signal,
  };
}

async function fetchHttp(
  transport: RemoteHttpTransport,
  call: RemoteHttpCall,
  http: SecureHttp | undefined,
): Promise<RemoteHttpResponse> {
  const extra = (await transport.headers?.(call.endpoint)) ?? {};
  const headers: Record<string, string> = { accept: "application/json" };
  if (call.body !== undefined) {
    headers["content-type"] = "application/json";
  }
  if (call.action === "submit") {
    headers["idempotency-key"] = call.operationId;
  }
  for (const [name, value] of Object.entries(extra)) {
    headers[name.toLowerCase()] = value;
  }
  const timeoutMs = transport.timeoutMs ?? DEFAULT_REMOTE_TIMEOUT_MS;
  const linked = linkAbortSignal(call.signal, timeoutMs);
  try {
    if (http) {
      const result = await http.request({
        url: call.url,
        method: call.method,
        headers,
        ...(call.body !== undefined ? { body: call.body } : {}),
        timeoutMs,
        signal: linked.signal,
        maxResponseBytes: 65_536,
      });
      if (!result.ok) {
        if (result.error === "redirect") {
          return { status: result.status ?? 302, body: "" };
        }
        throw secureFailure(result.error);
      }
      if (result.status >= 300 && result.status < 400) {
        return { status: result.status, body: "" };
      }
      return { status: result.status, body: result.body };
    }
    const response = await fetch(call.url, {
      method: call.method,
      headers,
      ...(call.body !== undefined ? { body: call.body } : {}),
      redirect: "manual",
      signal: linked.signal,
    });
    if (response.status >= 300 && response.status < 400) {
      return { status: response.status, body: "" };
    }
    if (response.type === "opaqueredirect") {
      return { status: 302, body: "" };
    }
    return { status: response.status, body: await response.text() };
  } finally {
    linked.stop();
  }
}

/** Abort when `parent` aborts or `timeoutMs` elapses. Works without AbortSignal.timeout or AbortSignal.any. */
export function linkAbortSignal(
  parent: AbortSignal,
  timeoutMs: number,
): { readonly signal: AbortSignal; stop: () => void } {
  const controller = new AbortController();
  const abort = (): void => {
    controller.abort();
  };
  if (parent.aborted) {
    controller.abort();
    return { signal: controller.signal, stop: () => undefined };
  }
  const timer = setTimeout(abort, timeoutMs);
  parent.addEventListener("abort", abort);
  let stopped = false;
  const stop = (): void => {
    if (stopped) {
      return;
    }
    stopped = true;
    clearTimeout(timer);
    parent.removeEventListener("abort", abort);
  };
  controller.signal.addEventListener("abort", stop);
  return { signal: controller.signal, stop };
}

function interpretHttp(
  action: string,
  operationId: string,
  response: RemoteHttpResponse,
): DelegationReport {
  if (response.status === 401 || response.status === 403) {
    return { outcome: "unauthorized", message: "The remote destination rejected the request." };
  }
  if (response.status === 409) {
    return {
      outcome: "conflict",
      message: "The remote peer rejected a different payload for this operation id.",
    };
  }
  if (response.status >= 300 && response.status < 400) {
    return {
      outcome: "temporary",
      message: "The remote peer returned a redirect. Redirects are not followed.",
    };
  }
  if (response.status === 404) {
    return { outcome: "not_found", message: "The remote task was not found." };
  }
  if ((response.status === 405 || response.status === 501) && action === "cancel") {
    return { outcome: "unsupported", message: "This remote transport cannot cancel the task." };
  }
  if (
    response.status === 408 ||
    response.status === 429 ||
    response.status === 500 ||
    response.status === 502 ||
    response.status === 503 ||
    response.status === 504
  ) {
    return {
      outcome: "temporary",
      message: `The remote peer returned HTTP ${String(response.status)}.`,
    };
  }
  if (response.status >= 400) {
    return {
      outcome: "permanent",
      message: `The remote peer returned HTTP ${String(response.status)}.`,
    };
  }
  if (response.status !== 200 && response.status !== 202) {
    return {
      outcome: "invalid",
      message: `The remote peer returned HTTP ${String(response.status)}.`,
    };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(response.body) as unknown;
  } catch {
    return { outcome: "invalid", message: "The remote response was not JSON." };
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return { outcome: "invalid", message: "The remote response must be a JSON object." };
  }
  const record = parsed as { readonly [key: string]: JsonValue };
  if (typeof record.operationId === "string" && record.operationId !== operationId) {
    return { outcome: "invalid", message: "The remote response named a different operation id." };
  }
  const taskId = typeof record.taskId === "string" ? record.taskId : undefined;
  if (taskId !== undefined && !TASK_ID.test(taskId)) {
    return { outcome: "invalid", message: "The remote task id is invalid." };
  }
  const status = record.status;
  if (typeof status !== "string") {
    return { outcome: "invalid", message: "The remote response did not include a status." };
  }
  const message = typeof record.message === "string" ? record.message : undefined;
  if (status === "completed") {
    if (!("result" in record)) {
      return {
        outcome: "invalid",
        message: "The completed remote response did not include a result.",
      };
    }
    const encoded = JSON.stringify(record.result);
    if (encoded.length > 65_536) {
      return { outcome: "invalid", message: "The remote result is larger than 65536 bytes." };
    }
    return {
      outcome: "completed",
      ...(taskId !== undefined ? { taskId } : {}),
      result: record.result,
      ...(message !== undefined ? { message } : {}),
    };
  }
  if (
    status !== "accepted" &&
    status !== "working" &&
    status !== "input_required" &&
    status !== "failed" &&
    status !== "cancelled"
  ) {
    return { outcome: "invalid", message: `Remote status "${status}" is not recognized.` };
  }
  return {
    outcome: status,
    ...(taskId !== undefined ? { taskId } : {}),
    ...(message !== undefined ? { message } : {}),
  };
}

function invalid(message: string): LarkxError {
  return new LarkxError({
    code: "invalid_workflow_definition",
    message,
    retryable: false,
  });
}

function isAbort(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : "The remote request failed.";
}
