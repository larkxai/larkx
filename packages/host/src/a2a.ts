import type { JsonValue } from "@larkxai/protocol";

import {
  A2A_PROTOCOL_VERSION,
  DEFAULT_REMOTE_TIMEOUT_MS,
  linkAbortSignal,
  type DelegationCommand,
  type DelegationReport,
  type RemoteA2aCall,
  type RemoteA2aTransport,
  type RemoteHttpResponse,
} from "./remote.js";

const TASK_ID = /^[A-Za-z0-9._:-]{1,128}$/;
const MAX_RESULT_BYTES = 65_536;

/**
 * Speaks A2A 1.0 JSON-RPC with `fetch`. `@a2a-js/sdk` also implements 1.0, but
 * its server, gRPC, and database transports depend on Node.js, so the public
 * React Native SDK does not import it.
 */
export async function performA2aDelegation(input: {
  readonly command: DelegationCommand;
  readonly transport: RemoteA2aTransport;
  readonly signal: AbortSignal;
  readonly online: () => boolean | Promise<boolean>;
}): Promise<DelegationReport> {
  const action = input.command.action;
  if (action !== "submit" && action !== "continue" && action !== "poll" && action !== "cancel") {
    return { outcome: "invalid", message: `A2A action "${action}" is not supported.` };
  }
  if (input.signal.aborted && (action === "submit" || action === "continue")) {
    return { outcome: "not_sent", message: "Cancelled before the A2A request was sent." };
  }
  if ((await input.online()) === false) {
    return { outcome: "offline", message: "The host reported no network connection." };
  }
  if (action === "continue") {
    if (input.command.taskId === undefined || input.command.contextId === undefined) {
      return {
        outcome: "invalid",
        message: "A continuation needs the stored task id and context id.",
      };
    }
    if (input.command.continuation === undefined || input.command.continuation.length === 0) {
      return { outcome: "invalid", message: "A continuation needs the supplied text." };
    }
  }
  if ((action === "poll" || action === "cancel") && input.command.taskId === undefined) {
    return { outcome: "invalid", message: "A poll or cancel needs the stored remote task id." };
  }
  let identity: string | undefined;
  if (input.transport.discover === true && action === "submit") {
    const card = await discover(input);
    if (card.report !== undefined) {
      return card.report;
    }
    identity = card.identity;
  }
  if (input.signal.aborted && (action === "submit" || action === "continue")) {
    return { outcome: "not_sent", message: "Cancelled before the A2A request was sent." };
  }
  const call = rpcCall(input.command, action, input.signal);
  try {
    const response = input.transport.execute
      ? await input.transport.execute(call)
      : await fetchA2a(input.transport, call);
    return interpretRpc(action, response, identity, {
      id: requestId(call),
      ...(input.command.taskId !== undefined ? { taskId: input.command.taskId } : {}),
      ...(input.command.contextId !== undefined ? { contextId: input.command.contextId } : {}),
    });
  } catch (error) {
    if (isAbort(error) || input.signal.aborted) {
      return { outcome: "timeout", message: "The A2A request timed out." };
    }
    return { outcome: "network", message: messageOf(error) };
  }
}

async function discover(input: {
  readonly command: DelegationCommand;
  readonly transport: RemoteA2aTransport;
  readonly signal: AbortSignal;
}): Promise<{ readonly identity?: string; readonly report?: DelegationReport }> {
  let last: DelegationReport = {
    outcome: "offline",
    message: "The Agent Card was not fetched. The task was not sent.",
  };
  for (const url of cardUrls(input.command.endpoint)) {
    const call: RemoteA2aCall = {
      action: "discover",
      method: "GET",
      url,
      endpoint: input.command.endpoint,
      operationId: input.command.operationId,
      signal: input.signal,
    };
    let response: RemoteHttpResponse;
    try {
      response = input.transport.execute
        ? await input.transport.execute(call)
        : await fetchA2a(input.transport, call);
    } catch (error) {
      if (isAbort(error) || input.signal.aborted) {
        return {
          report: { outcome: "not_sent", message: "Cancelled before the A2A request was sent." },
        };
      }
      last = {
        outcome: "offline",
        message: "The Agent Card could not be fetched. The task was not sent.",
      };
      continue;
    }
    if (response.status === 404) {
      continue;
    }
    const parsed = parseCard(input.command.endpoint, response);
    if (parsed.report !== undefined || parsed.identity === undefined) {
      return parsed.report === undefined
        ? { report: { outcome: "permanent", message: "The Agent Card name is missing." } }
        : parsed;
    }
    return { identity: parsed.identity };
  }
  return { report: last };
}

function cardUrls(endpoint: string): readonly string[] {
  const direct = `${endpoint}/.well-known/agent-card.json`;
  const scheme = endpoint.startsWith("https://") ? "https://" : "http://";
  const rest = endpoint.slice(scheme.length);
  const slash = rest.indexOf("/");
  const origin = slash === -1 ? endpoint : endpoint.slice(0, scheme.length + slash);
  const root = `${origin}/.well-known/agent-card.json`;
  return root === direct ? [direct] : [direct, root];
}

function parseCard(
  endpoint: string,
  response: RemoteHttpResponse,
): { readonly identity?: string; readonly report?: DelegationReport } {
  if (response.status === 401 || response.status === 403) {
    return { report: { outcome: "unauthorized", message: "The Agent Card request was rejected." } };
  }
  if (response.status >= 300 && response.status < 400) {
    return {
      report: {
        outcome: "temporary",
        message: "The Agent Card redirect was not followed. The task was not sent.",
      },
    };
  }
  if (response.status !== 200) {
    return {
      report: {
        outcome: "permanent",
        message: `The Agent Card request returned HTTP ${String(response.status)}.`,
      },
    };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(response.body) as unknown;
  } catch {
    return { report: { outcome: "permanent", message: "The Agent Card was not JSON." } };
  }
  if (!isRecord(parsed)) {
    return { report: { outcome: "permanent", message: "The Agent Card must be an object." } };
  }
  const name = parsed.name;
  const description = parsed.description;
  const version = parsed.version;
  const interfaces = parsed.supportedInterfaces;
  const skills = parsed.skills;
  if (typeof name !== "string" || name.trim().length === 0 || name.length > 80) {
    return { report: { outcome: "permanent", message: "The Agent Card name is missing." } };
  }
  if (typeof description !== "string" || description.trim().length === 0) {
    return { report: { outcome: "permanent", message: "The Agent Card description is missing." } };
  }
  if (typeof version !== "string" || version.length === 0 || version.length > 40) {
    return { report: { outcome: "permanent", message: "The Agent Card version is missing." } };
  }
  if (!Array.isArray(skills)) {
    return { report: { outcome: "permanent", message: "The Agent Card skills are missing." } };
  }
  const capabilities = parsed.capabilities;
  if (isRecord(capabilities) && Array.isArray(capabilities.extensions)) {
    for (const extension of capabilities.extensions) {
      if (isRecord(extension) && extension.required === true) {
        return {
          report: {
            outcome: "permanent",
            message: "The agent requires an A2A extension this client does not implement.",
          },
        };
      }
    }
  }
  if (!Array.isArray(interfaces) || interfaces.length === 0) {
    return {
      report: { outcome: "permanent", message: "The Agent Card has no supported interfaces." },
    };
  }
  const match = interfaces.some((entry) => {
    if (!isRecord(entry)) {
      return false;
    }
    return (
      entry.protocolBinding === "JSONRPC" &&
      entry.protocolVersion === A2A_PROTOCOL_VERSION &&
      entry.url === endpoint
    );
  });
  if (!match) {
    return {
      report: {
        outcome: "unauthorized",
        message: `The Agent Card has no JSON-RPC ${A2A_PROTOCOL_VERSION} interface at the authorized endpoint.`,
      },
    };
  }
  return { identity: name };
}

function rpcCall(
  command: DelegationCommand,
  action: "submit" | "continue" | "poll" | "cancel",
  signal: AbortSignal,
): RemoteA2aCall {
  if (action === "poll" || action === "cancel") {
    const method = action === "poll" ? "GetTask" : "CancelTask";
    return {
      action,
      method: "POST",
      url: command.endpoint,
      endpoint: command.endpoint,
      operationId: command.operationId,
      ...(command.taskId !== undefined ? { taskId: command.taskId } : {}),
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: `${command.operationId}:${action}`,
        method,
        params: { id: command.taskId },
      }),
      signal,
    };
  }
  const messageId = action === "continue" ? `${command.operationId}:continue` : command.operationId;
  const text = action === "continue" ? (command.continuation ?? "") : JSON.stringify(command.input);
  const message: { [key: string]: JsonValue } = {
    messageId,
    parts: [{ text }],
    role: "ROLE_USER",
  };
  if (action === "continue") {
    message.contextId = command.contextId ?? "";
    message.taskId = command.taskId ?? "";
  }
  return {
    action,
    method: "POST",
    url: command.endpoint,
    endpoint: command.endpoint,
    operationId: command.operationId,
    ...(command.taskId !== undefined ? { taskId: command.taskId } : {}),
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: messageId,
      method: "SendMessage",
      params: {
        configuration: { returnImmediately: true },
        message,
      },
    }),
    signal,
  };
}

async function fetchA2a(
  transport: RemoteA2aTransport,
  call: RemoteA2aCall,
): Promise<RemoteHttpResponse> {
  const extra = (await transport.headers?.(call.endpoint)) ?? {};
  const headers: Record<string, string> = {
    accept: "application/json",
    "a2a-version": A2A_PROTOCOL_VERSION,
  };
  if (call.body !== undefined) {
    headers["content-type"] = "application/json";
  }
  for (const [name, value] of Object.entries(extra)) {
    headers[name.toLowerCase()] = value;
  }
  const linked = linkAbortSignal(call.signal, transport.timeoutMs ?? DEFAULT_REMOTE_TIMEOUT_MS);
  try {
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

interface RpcExpectation {
  readonly id: string;
  readonly taskId?: string;
  readonly contextId?: string;
}

function requestId(call: RemoteA2aCall): string {
  if (call.body === undefined) {
    return "";
  }
  try {
    const parsed = JSON.parse(call.body) as { readonly id?: unknown };
    return typeof parsed.id === "string" ? parsed.id : "";
  } catch {
    return "";
  }
}

function interpretRpc(
  action: string,
  response: RemoteHttpResponse,
  identity: string | undefined,
  expected: RpcExpectation,
): DelegationReport {
  const withIdentity = (report: DelegationReport): DelegationReport =>
    identity === undefined ? report : { ...report, remoteIdentity: identity };
  if (response.status === 401 || response.status === 403) {
    return withIdentity({
      outcome: "unauthorized",
      message: "The remote destination rejected the request.",
    });
  }
  if (response.status >= 300 && response.status < 400) {
    return withIdentity({
      outcome: "temporary",
      message: "The remote peer returned a redirect. Redirects are not followed.",
    });
  }
  if (
    response.status === 408 ||
    response.status === 429 ||
    response.status === 500 ||
    response.status === 502 ||
    response.status === 503 ||
    response.status === 504
  ) {
    return withIdentity({
      outcome: "temporary",
      message: `The remote peer returned HTTP ${String(response.status)}.`,
    });
  }
  if (response.status !== 200) {
    return withIdentity({
      outcome: "permanent",
      message: `The remote peer returned HTTP ${String(response.status)}.`,
    });
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(response.body) as unknown;
  } catch {
    return withIdentity({ outcome: "invalid", message: "The A2A response was not JSON." });
  }
  if (!isRecord(parsed)) {
    return withIdentity({ outcome: "invalid", message: "The A2A response must be an object." });
  }
  if (parsed.jsonrpc !== "2.0") {
    return withIdentity({ outcome: "invalid", message: "The A2A response is not JSON-RPC 2.0." });
  }
  if (!Object.hasOwn(parsed, "id") || parsed.id === null || parsed.id === undefined) {
    return withIdentity({ outcome: "invalid", message: "The A2A response id is missing." });
  }
  if (typeof parsed.id !== "string" || parsed.id.length === 0 || parsed.id !== expected.id) {
    return withIdentity({
      outcome: "invalid",
      message: "The A2A response id does not match the request.",
    });
  }
  const hasResult = Object.hasOwn(parsed, "result") && parsed.result !== null;
  const hasError = Object.hasOwn(parsed, "error") && parsed.error !== null;
  if (hasResult && hasError) {
    return withIdentity({
      outcome: "invalid",
      message: "The A2A response contains both result and error.",
    });
  }
  if (hasError) {
    if (!isRecord(parsed.error)) {
      return withIdentity({ outcome: "invalid", message: "The A2A error must be an object." });
    }
    return withIdentity(interpretError(action, parsed.error));
  }
  if (!hasResult) {
    return withIdentity({
      outcome: "invalid",
      message: "The A2A response did not include a result.",
    });
  }
  return withIdentity(interpretResult(action, parsed.result, expected));
}

function interpretError(
  action: string,
  error: { readonly [key: string]: JsonValue },
): DelegationReport {
  const code = typeof error.code === "number" ? error.code : 0;
  const message = typeof error.message === "string" ? error.message : "The A2A request failed.";
  if (code === -32009) {
    return { outcome: "permanent", message: "The remote peer does not support A2A 1.0." };
  }
  if (code === -32001) {
    return { outcome: "not_found", message };
  }
  if ((code === -32002 || code === -32004 || code === -32601) && action === "cancel") {
    return { outcome: "unsupported", message: "This remote agent cannot cancel the task." };
  }
  if (code === -32603 || code === -32006) {
    return { outcome: "temporary", message };
  }
  if (code === -32600 || code === -32602 || code === -32005) {
    return { outcome: "permanent", message };
  }
  return { outcome: "invalid", message };
}

function interpretResult(
  action: string,
  result: JsonValue | undefined,
  expected: RpcExpectation,
): DelegationReport {
  if (!isRecord(result)) {
    return { outcome: "invalid", message: "The A2A result must be an object." };
  }
  const task = isRecord(result.task) ? result.task : looksLikeTask(result) ? result : undefined;
  const message = isRecord(result.message)
    ? result.message
    : task === undefined && looksLikeMessage(result)
      ? result
      : undefined;
  if (message !== undefined && task !== undefined) {
    const agreed = identitiesAgree(task, message);
    if (agreed !== undefined) {
      return { outcome: "invalid", message: agreed };
    }
  }
  if (action !== "submit" && action !== "continue" && message !== undefined && task === undefined) {
    return { outcome: "invalid", message: "A poll or cancel must return a task." };
  }
  if (message !== undefined && task === undefined) {
    const messageTask = readIdentity(message.taskId);
    const messageContext = readIdentity(message.contextId);
    if (!messageTask.ok || !messageContext.ok) {
      return { outcome: "invalid", message: "The remote task id is invalid." };
    }
    const mismatch = identityMismatch(messageTask.value, messageContext.value, expected);
    if (mismatch !== undefined) {
      return { outcome: "invalid", message: mismatch };
    }
    const text = textFromParts(message.parts);
    const encoded = JSON.stringify({ remoteState: "MESSAGE", text });
    if (encoded.length > MAX_RESULT_BYTES) {
      return { outcome: "invalid", message: "The remote result is larger than 65536 bytes." };
    }
    return {
      outcome: "completed",
      remoteStatus: "MESSAGE",
      result: { remoteState: "MESSAGE", text },
    };
  }
  if (task === undefined) {
    return { outcome: "invalid", message: "The A2A result did not include a task or a message." };
  }
  const taskId = typeof task.id === "string" ? task.id : undefined;
  if (taskId === undefined || !TASK_ID.test(taskId)) {
    return { outcome: "invalid", message: "The remote task id is invalid." };
  }
  const context = typeof task.contextId === "string" ? task.contextId : undefined;
  if (context !== undefined && !TASK_ID.test(context)) {
    return { outcome: "invalid", message: "The remote context id is invalid." };
  }
  const mismatch = identityMismatch(taskId, context, expected);
  if (mismatch !== undefined) {
    return { outcome: "invalid", message: mismatch };
  }
  const status = isRecord(task.status) ? task.status : undefined;
  const state = status !== undefined && typeof status.state === "string" ? status.state : "";
  if (!/^[A-Z0-9_]{1,64}$/.test(state)) {
    return {
      outcome: "invalid",
      taskId,
      ...(context !== undefined ? { contextId: context } : {}),
      message: "The remote task state is missing.",
    };
  }
  const prompt =
    status === undefined
      ? ""
      : textFromParts(isRecord(status.message) ? status.message.parts : undefined);
  const base = {
    taskId,
    ...(context !== undefined ? { contextId: context } : {}),
    remoteStatus: state,
    ...(prompt.length > 0 ? { message: prompt.slice(0, 300) } : {}),
  };
  if (state === "TASK_STATE_COMPLETED") {
    const text = [textFromArtifacts(task.artifacts), prompt]
      .filter((part) => part.length > 0)
      .join("\n");
    const observation = { contextId: context ?? null, remoteState: state, taskId, text };
    const encoded = JSON.stringify(observation);
    if (encoded.length > MAX_RESULT_BYTES) {
      return {
        outcome: "invalid",
        message: "The remote result is larger than 65536 bytes.",
        taskId,
      };
    }
    return { ...base, outcome: "completed", result: observation };
  }
  if (state === "TASK_STATE_FAILED" || state === "TASK_STATE_REJECTED") {
    return {
      ...base,
      outcome: "failed",
      message: prompt.length > 0 ? prompt.slice(0, 300) : `The remote task ended ${state}.`,
    };
  }
  if (state === "TASK_STATE_CANCELED") {
    return {
      ...base,
      outcome: "cancelled",
      message: prompt.length > 0 ? prompt.slice(0, 300) : "The remote task was cancelled.",
    };
  }
  if (state === "TASK_STATE_AUTH_REQUIRED") {
    if (context === undefined) {
      return {
        outcome: "invalid",
        taskId,
        remoteStatus: state,
        message: "The remote task did not include a context id.",
      };
    }
    return {
      ...base,
      outcome: "auth_required",
      message:
        prompt.length > 0
          ? prompt.slice(0, 300)
          : "The remote agent requires authentication. Refresh the host authorization headers. Do not send credentials as remote input.",
    };
  }
  if (state === "TASK_STATE_INPUT_REQUIRED") {
    if (context === undefined) {
      return {
        outcome: "invalid",
        taskId,
        remoteStatus: state,
        message: "The remote task did not include a context id.",
      };
    }
    return {
      ...base,
      outcome: "input_required",
      message:
        prompt.length > 0 ? prompt.slice(0, 300) : "The remote agent needs more information.",
    };
  }
  if (state === "TASK_STATE_SUBMITTED" || state === "TASK_STATE_WORKING") {
    return { ...base, outcome: state === "TASK_STATE_WORKING" ? "working" : "accepted" };
  }
  return {
    ...base,
    outcome: "temporary",
    message: `Remote state ${state} is not a supported terminal state.`,
  };
}

function readIdentity(
  value: JsonValue | undefined,
): { readonly ok: true; readonly value?: string } | { readonly ok: false } {
  if (value === undefined) {
    return { ok: true };
  }
  if (typeof value !== "string" || !TASK_ID.test(value)) {
    return { ok: false };
  }
  return { ok: true, value };
}

function identityMismatch(
  taskId: string | undefined,
  contextId: string | undefined,
  expected: RpcExpectation,
): string | undefined {
  if (expected.taskId !== undefined && taskId !== undefined && taskId !== expected.taskId) {
    return "The A2A response named a different task.";
  }
  if (
    expected.contextId !== undefined &&
    contextId !== undefined &&
    contextId !== expected.contextId
  ) {
    return "The A2A response named a different context.";
  }
  return undefined;
}

function identitiesAgree(
  task: { readonly [key: string]: JsonValue },
  message: { readonly [key: string]: JsonValue },
): string | undefined {
  const taskId = typeof task.id === "string" ? task.id : undefined;
  const contextId = typeof task.contextId === "string" ? task.contextId : undefined;
  const messageTask = typeof message.taskId === "string" ? message.taskId : undefined;
  const messageContext = typeof message.contextId === "string" ? message.contextId : undefined;
  if (
    (messageTask !== undefined && taskId !== undefined && messageTask !== taskId) ||
    (messageContext !== undefined && contextId !== undefined && messageContext !== contextId)
  ) {
    return "The A2A message does not match the task.";
  }
  return undefined;
}

function looksLikeTask(value: { readonly [key: string]: JsonValue }): boolean {
  return typeof value.id === "string" && isRecord(value.status);
}

function looksLikeMessage(value: { readonly [key: string]: JsonValue }): boolean {
  return Array.isArray(value.parts) && typeof value.messageId === "string";
}

function textFromArtifacts(value: JsonValue | undefined): string {
  if (!Array.isArray(value)) {
    return "";
  }
  const parts: string[] = [];
  for (const artifact of value) {
    if (!isRecord(artifact)) {
      continue;
    }
    const text = textFromParts(artifact.parts);
    if (text.length > 0) {
      parts.push(text);
    }
  }
  return parts.join("\n");
}

function textFromParts(value: JsonValue | undefined): string {
  if (!Array.isArray(value)) {
    return "";
  }
  const parts: string[] = [];
  for (const part of value) {
    if (isRecord(part) && typeof part.text === "string") {
      parts.push(part.text);
    }
  }
  return parts.join("\n");
}

function isRecord(value: unknown): value is { readonly [key: string]: JsonValue } {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isAbort(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : "The A2A request failed.";
}
