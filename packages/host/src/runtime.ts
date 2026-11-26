import type { EffectType, JsonObject, JsonValue } from "@larkxai/protocol";
import { isErrorCode, LarkxError, type ErrorCode } from "@larkxai/protocol";

import { performA2aDelegation } from "./a2a.js";
import {
  A2A_REMOTE_CAPABILITIES,
  performHttpDelegation,
  resolvedCapabilities,
  transportId,
  type DelegationCommand,
  type DelegationView,
  type RemoteAgent,
} from "./remote.js";

/**
 * Host loop for the shared C++ runtime.
 * `larkx_run_drive` decides the next action. This module invokes the model or
 * tool the core asked for and submits that result. It does not plan steps.
 */

const TOOL_NAME = /^[a-z][a-z0-9_]{0,63}$/;
const AGENT_NAME = /^[a-z][a-z0-9-]{0,63}$/;

const RequestKind = {
  InvokeModel: 1,
  InvokeTool: 2,
  Reconcile: 3,
  Wait: 4,
  Complete: 5,
  Blocked: 6,
  Failed: 7,
  Cancelled: 8,
  Paused: 9,
  Delegate: 10,
} as const;

export interface SqliteStorage {
  readonly kind: "sqlite";
  readonly path: string;
}

export function sqlite(path: string): SqliteStorage {
  if (path.trim().length === 0) {
    throw invalid("SQLite path is empty.");
  }
  return { kind: "sqlite", path };
}

export interface HostTransport {
  invoke(method: string, args: { readonly [key: string]: JsonValue }): string | Promise<string>;
}

export interface AppStateSource {
  readonly currentState: string | null | undefined;
  addEventListener(type: "change", listener: (state: string) => void): { remove(): void };
}

export interface JsonSchema {
  readonly type: "object";
  readonly properties?: { readonly [key: string]: JsonValue };
  readonly required?: readonly string[];
  readonly additionalProperties?: boolean;
}

export interface ToolContext {
  readonly operationId: string;
  readonly attempt: number;
  readonly runId: string;
  readonly stepKey: string;
  readonly callId: string;
  readonly signal: AbortSignal;
}

export interface Tool {
  readonly name: string;
  readonly description: string;
  readonly schema: JsonSchema;
  readonly effects: EffectType;
  readonly retry?: RetryPolicy;
  handler(input: JsonValue, context: ToolContext): Promise<JsonValue> | JsonValue;
}

export interface RetryPolicy {
  readonly maxAttempts: number;
  readonly initialIntervalMs: number;
  readonly maxIntervalMs: number;
  readonly backoff: "fixed" | "exponential";
}

export class ToolFailure extends Error {
  readonly retryable: boolean;
  readonly code: string;

  constructor(message: string, options?: { readonly retryable?: boolean; readonly code?: string }) {
    super(message);
    this.name = "ToolFailure";
    this.retryable = options?.retryable ?? false;
    this.code =
      options?.code ??
      (this.retryable ? "transient_execution_failure" : "permanent_execution_failure");
  }
}

export interface ToolCall {
  readonly id: string;
  readonly name: string;
  readonly arguments: JsonObject;
}

export interface ModelResponse {
  readonly message: string | null;
  readonly finish: "stop" | "tool_calls" | "length" | "error";
  readonly calls: readonly ToolCall[];
  readonly usage?: {
    readonly inputTokens?: number;
    readonly outputTokens?: number;
    readonly totalTokens?: number;
  };
  readonly timingMs?: {
    readonly total?: number;
    readonly timeToFirstToken?: number;
  };
}

export interface ModelRequest {
  readonly messages: readonly JsonValue[];
  readonly tools: readonly JsonValue[];
}

export interface ModelContext {
  readonly signal: AbortSignal;
}

export interface Model {
  readonly id: string;
  readonly model: string;
  readonly capabilities?: { readonly toolCalling?: boolean };
  complete(request: ModelRequest, context: ModelContext): Promise<ModelResponse>;
}

export interface ScriptedModel extends Model {
  readonly invocations: number;
}

export interface AgentResult {
  readonly message: string;
  readonly finish: "stop" | "length";
  readonly iterations: number;
  readonly toolCalls: number;
}

export interface RunStatus {
  readonly runId: string;
  readonly status: string;
  readonly workflowName: string;
  readonly workflowVersion: number;
  readonly cancelRequested: boolean;
  readonly ownershipEpoch: number;
  readonly ownerId: string;
  readonly blockedReason: string;
}

export interface HistoryStep {
  readonly stepKey: string;
  readonly stepOrder: number;
  readonly status: string;
  readonly effectType: string;
  readonly operationId: string;
  readonly attemptCount: number;
  readonly executionTarget: string;
  readonly output: JsonValue | null;
}

export interface HistoryEvent {
  readonly index: number;
  readonly payload: JsonValue;
}

export interface RunHistory {
  readonly steps: readonly HistoryStep[];
  readonly events: readonly HistoryEvent[];
}

export interface ReconcileInput {
  readonly resolution: "retry" | "complete" | "fail";
  readonly output?: JsonValue;
  readonly message?: string;
}

export interface RuntimeVersions {
  readonly backend: "native-cpp";
  readonly abi: number;
  readonly protocol: number;
  readonly schema: number;
}

export interface CreateRuntimeOptions {
  readonly storage: SqliteStorage;
  readonly transport: HostTransport;
  readonly ownerId?: string;
  readonly leaseMs?: number;
  readonly exclusive?: boolean;
  readonly maySteal?: boolean;
  readonly now?: () => number;
  readonly sleep?: (milliseconds: number) => Promise<void>;
  /**
   * Host network probe. Return false only when the request has not been sent.
   * The default assumes the network is available.
   */
  readonly isOnline?: () => boolean | Promise<boolean>;
}

export interface AgentOptions {
  readonly name: string;
  readonly version: number;
  readonly model: Model;
  readonly instructions: string;
  readonly tools?: readonly Tool[];
  /** Registered remote agents. A non-empty list authorizes remote delegation. */
  readonly remoteAgents?: readonly RemoteAgent[];
  readonly maxIterations?: number;
  readonly maxToolCalls?: number;
  readonly maxInvalidToolRequests?: number;
  readonly maxContextChars?: number;
  readonly modelRetry?: RetryPolicy;
}

export interface StartInput {
  readonly message: string;
  readonly runId?: string;
  /**
   * Persist the run and return without scheduling the host driver.
   * Call `run.schedule()` when execution should begin. `run.result()` waits
   * either way. It does not start the driver.
   */
  readonly defer?: boolean;
}

export interface ResumeOptions {
  /**
   * Attach to the persisted run without scheduling recovery.
   * The default schedules one driver for that run id.
   */
  readonly defer?: boolean;
}

export interface HostEvent {
  readonly type:
    | "run-started"
    | "model-requested"
    | "model-committed"
    | "tool-requested"
    | "tool-committed"
    | "retry"
    | "reconcile-required"
    | "before-completion"
    | "run-completed"
    | "run-failed"
    | "run-paused"
    | "remote-requested"
    | "remote-response"
    | "remote-waiting"
    | "remote-input-required";
  readonly runId: string;
  readonly stepKey?: string;
  readonly operationId?: string;
  readonly attempt?: number;
  readonly status?: string;
  readonly action?: string;
  readonly outcome?: string;
  readonly taskId?: string;
  readonly contextId?: string;
  readonly prompt?: string;
  readonly waitingFor?: string;
  readonly atMs: number;
}

export interface RuntimeDiagnostics {
  readonly initializationMs: number;
  readonly modelInvocations: number;
  readonly toolInvocations: number;
  readonly modelDurationMs: number;
  readonly toolDurationMs: number;
  readonly lastModelMs: number | null;
  readonly lastToolMs: number | null;
  readonly lastTimeToFirstTokenMs: number | null;
  readonly recoveryMs: number | null;
}

interface DriveRequest {
  readonly kind: number;
  readonly requestId: string;
  readonly stepKey: string;
  readonly operationId: string;
  readonly toolName: string;
  readonly attempt: number;
  readonly waitUntilMs: number;
  readonly hasWaitUntil: boolean;
  readonly effectType: string;
  readonly cancelRequested: boolean;
  readonly detailJson: string;
}

interface RegisteredAgent {
  readonly name: string;
  readonly version: number;
  readonly model: Model;
  readonly tools: ReadonlyMap<string, Tool>;
  readonly remotes: ReadonlyMap<string, RemoteAgent>;
}

type Settlement =
  | { readonly ok: true; readonly value: AgentResult }
  | { readonly ok: false; readonly error: LarkxError };

export async function createRuntime(options: CreateRuntimeOptions): Promise<Runtime> {
  if (options.storage.kind !== "sqlite") {
    throw invalid("The native runtime opens a SQLite file.");
  }
  const runtime = new Runtime(options);
  await runtime.open();
  return runtime;
}

export function defineTool(definition: {
  readonly name: string;
  readonly description: string;
  readonly effects: EffectType;
  readonly schema?: JsonSchema;
  readonly inputSchema?: JsonSchema;
  readonly retry?: RetryPolicy;
  readonly handler?: (input: JsonValue, context: ToolContext) => Promise<JsonValue> | JsonValue;
  readonly run?: (input: JsonValue, context: ToolContext) => Promise<JsonValue> | JsonValue;
}): Tool {
  const schema = definition.schema ?? definition.inputSchema;
  const handler = definition.handler ?? definition.run;
  if (!TOOL_NAME.test(definition.name)) {
    throw invalid(`Tool name "${definition.name}" must match ${TOOL_NAME.source}.`);
  }
  if (definition.description.trim().length === 0) {
    throw invalid(`Tool "${definition.name}" needs a description.`);
  }
  if (schema === undefined || schema.type !== "object") {
    throw invalid(`Tool "${definition.name}" input schema must be an object.`);
  }
  if (
    definition.effects !== "pure" &&
    definition.effects !== "idempotent" &&
    definition.effects !== "non-idempotent"
  ) {
    throw invalid(`Tool "${definition.name}" has an unknown effect class.`);
  }
  if (handler === undefined) {
    throw invalid(`Tool "${definition.name}" needs a handler.`);
  }
  if (definition.retry !== undefined) {
    assertRetry(definition.name, definition.retry);
  }
  return {
    name: definition.name,
    description: definition.description,
    schema,
    effects: definition.effects,
    ...(definition.retry !== undefined ? { retry: definition.retry } : {}),
    handler,
  };
}

export function scriptedModel(
  responses: readonly ModelResponse[],
  options?: { readonly id?: string; readonly model?: string },
): ScriptedModel {
  let invocations = 0;
  return {
    id: options?.id ?? "scripted",
    model: options?.model ?? "scripted-1",
    get invocations() {
      return invocations;
    },
    async complete(_request, context) {
      if (context.signal.aborted) {
        throw cancelled("Model call cancelled.");
      }
      const response = responses[invocations];
      invocations += 1;
      if (response === undefined) {
        throw permanent(
          "Scripted model has no response left. A committed model step was repeated.",
        );
      }
      return response;
    },
  };
}

export function bindNativeAppState(runtime: Runtime, appState: AppStateSource): { remove(): void } {
  const apply = (state: string) => {
    runtime.setSuspended(state !== "active");
  };
  if (typeof appState.currentState === "string") {
    apply(appState.currentState);
  }
  const subscription = appState.addEventListener("change", apply);
  return {
    remove() {
      subscription.remove();
    },
  };
}

export class Runtime {
  readonly ownerId: string;
  readonly versions: RuntimeVersions;
  private readonly transport: HostTransport;
  private readonly storage: SqliteStorage;
  private readonly leaseMs: number;
  private readonly exclusive: boolean;
  private readonly maySteal: boolean;
  private readonly clock: () => number;
  private readonly sleeper: (milliseconds: number) => Promise<void>;
  private readonly isOnline: () => boolean | Promise<boolean>;
  private readonly agents = new Map<string, RegisteredAgent>();
  private readonly runs = new Map<string, Run>();
  private readonly drivers = new Map<string, Run>();
  private readonly runLocks = new Map<string, Promise<unknown>>();
  private generation = 0;
  private opened = false;
  private suspended = false;
  private foreground: Array<() => void> = [];
  private readonly observers: Array<(event: HostEvent) => void | Promise<void>> = [];
  private readonly barriers: Array<(event: HostEvent) => void | Promise<void>> = [];
  private initializationMs = 0;
  private modelInvocations = 0;
  private toolInvocations = 0;
  private modelDurationMs = 0;
  private toolDurationMs = 0;
  private lastModelMs: number | null = null;
  private lastToolMs: number | null = null;
  private lastTimeToFirstTokenMs: number | null = null;
  private recoveryMs: number | null = null;
  private versionsReady: RuntimeVersions = {
    backend: "native-cpp",
    abi: 0,
    protocol: 0,
    schema: 0,
  };

  constructor(options: CreateRuntimeOptions) {
    this.transport = options.transport;
    this.storage = options.storage;
    this.ownerId = options.ownerId ?? "larkx";
    this.leaseMs = options.leaseMs ?? 0;
    this.exclusive = options.exclusive ?? true;
    this.maySteal = options.maySteal ?? false;
    this.clock = options.now ?? (() => Date.now());
    this.sleeper =
      options.sleep ??
      ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
    this.isOnline = options.isOnline ?? (() => true);
    this.versions = this.versionsReady;
  }

  get generationId(): number {
    return this.generation;
  }

  async open(): Promise<void> {
    const reported = JSON.parse(await this.transport.invoke("versions", {})) as unknown;
    this.versionsReady = {
      backend: "native-cpp",
      abi: readNumber(reported, "abi"),
      protocol: readNumber(reported, "protocol"),
      schema: readNumber(reported, "schema"),
    };
    Object.assign(this.versions, this.versionsReady);
    const started = Date.now();
    await this.call("open", {
      path: this.storage.path,
      ownerId: this.ownerId,
      leaseMs: this.leaseMs,
      exclusive: this.exclusive,
      maySteal: this.maySteal,
    });
    this.initializationMs = Date.now() - started;
    this.opened = true;
  }

  createAgent(options: AgentOptions): Agent {
    this.ensureOpen();
    if (!AGENT_NAME.test(options.name)) {
      throw invalid(`Agent name "${options.name}" must match ${AGENT_NAME.source}.`);
    }
    if (!Number.isInteger(options.version) || options.version < 1) {
      throw invalid("Agent version must be an integer greater than or equal to 1.");
    }
    if (options.instructions.trim().length === 0) {
      throw invalid("Agent instructions are empty.");
    }
    if (options.model.id.trim().length === 0 || options.model.model.trim().length === 0) {
      throw invalid("The model adapter needs an id and a model name.");
    }
    const tools = new Map<string, Tool>();
    for (const tool of options.tools ?? []) {
      if (tools.has(tool.name)) {
        throw invalid(`Tool "${tool.name}" is registered more than once.`);
      }
      tools.set(tool.name, tool);
    }
    const remotes = new Map<string, RemoteAgent>();
    for (const remote of options.remoteAgents ?? []) {
      if (tools.has(remote.name) || remotes.has(remote.name)) {
        throw invalid(`Remote agent "${remote.name}" collides with another capability.`);
      }
      remotes.set(remote.name, remote);
    }
    const key = agentKey(options.name, options.version);
    if (this.agents.has(key)) {
      throw invalid(
        `Agent ${options.name}@${String(options.version)} is registered more than once.`,
      );
    }
    const registered: RegisteredAgent = {
      name: options.name,
      version: options.version,
      model: options.model,
      tools,
      remotes,
    };
    this.agents.set(key, registered);
    const ready = this.call("registerAgent", {
      agent: {
        name: options.name,
        version: options.version,
        instructions: options.instructions,
        modelId: options.model.id,
        modelName: options.model.model,
        toolCalling: options.model.capabilities?.toolCalling !== false,
        tools: [...tools.values()].map((tool) => ({
          name: tool.name,
          description: tool.description,
          schema: tool.schema as unknown as JsonValue,
          effects: tool.effects,
          maxAttempts: tool.retry?.maxAttempts ?? 0,
          initialIntervalMs: tool.retry?.initialIntervalMs ?? -1,
          maxIntervalMs: tool.retry?.maxIntervalMs ?? -1,
          backoff: tool.retry?.backoff ?? "",
        })),
        maxIterations: options.maxIterations ?? 0,
        maxToolCalls: options.maxToolCalls ?? 0,
        maxInvalidToolRequests: options.maxInvalidToolRequests ?? 0,
        maxContextChars: options.maxContextChars ?? 0,
        modelMaxAttempts: options.modelRetry?.maxAttempts ?? 0,
        modelInitialIntervalMs: options.modelRetry?.initialIntervalMs ?? -1,
        modelMaxIntervalMs: options.modelRetry?.maxIntervalMs ?? -1,
        modelBackoff: options.modelRetry?.backoff ?? "",
        remoteAgents: [...remotes.values()].map((remote) => {
          const capabilities =
            remote.transport.type === "a2a"
              ? A2A_REMOTE_CAPABILITIES
              : resolvedCapabilities(remote.transport.capabilities);
          return {
            name: remote.name,
            description: remote.description,
            schema: remote.schema as unknown as JsonValue,
            endpoint: remote.transport.endpoint,
            transport: remote.transport.type,
            pollIntervalMs: remote.transport.pollIntervalMs ?? 0,
            dedupe: capabilities.dedupe,
            lookup: capabilities.lookup,
            durableTask: capabilities.taskId,
            poll: capabilities.poll,
            cancel: capabilities.cancel,
            persistent: capabilities.persistent,
          };
        }),
        allowRemote: remotes.size > 0,
      },
    }).then(
      () => undefined,
      (error: unknown) => {
        this.agents.delete(key);
        throw error instanceof LarkxError ? error : nativeError(error);
      },
    );
    void ready.catch(() => undefined);
    return new Agent(this, registered, ready);
  }

  /**
   * Attach to a run that was persisted earlier. Register the agent first.
   * Unless `defer` is set, this schedules the one driver for that run id.
   * A `WAITING` run stays paused until `run.resume()`. A terminal run resolves
   * `result()` from the stored output.
   */
  async resume(runId: string, options?: ResumeOptions): Promise<Run> {
    this.ensureOpen();
    const generation = this.generation;
    const started = Date.now();
    return this.lockRun(runId, async () => {
      this.ensureGeneration(generation);
      const existing = this.currentRun(runId);
      if (existing !== undefined) {
        if (options?.defer !== true) {
          existing.schedule();
        }
        return existing;
      }
      const info = await this.inspect(runId);
      this.ensureGeneration(generation);
      const agent = this.agentFor(info.workflowName, info.workflowVersion);
      const run = new Run(this, runId, agent, generation);
      if (info.status === "WAITING") {
        run.notePaused();
      }
      this.runs.set(runId, run);
      this.recoveryMs = Date.now() - started;
      if (options?.defer !== true) {
        run.schedule();
      }
      return run;
    });
  }

  /** Persisted runs in the shared C++ store. This is the source of truth after relaunch. */
  async listRuns(): Promise<readonly RunStatus[]> {
    this.ensureOpen();
    const parsed = JSON.parse(await this.call("listRuns", {})) as { runs?: unknown };
    if (!Array.isArray(parsed.runs)) {
      throw permanent("The native runtime returned a run list that is not an array.");
    }
    return parsed.runs.map((entry) => readStatus(entry));
  }

  /**
   * Diagnostics listener. The driver does not wait for it, and a throw or
   * rejection does not fail the run.
   */
  observe(listener: (event: HostEvent) => void | Promise<void>): () => void {
    this.observers.push(listener);
    return () => {
      removeListener(this.observers, listener);
    };
  }

  /**
   * Development barrier. The driver waits for each listener so a demo can hold
   * the process at a boundary. A throw or rejection does not fail the run.
   * This is not a production control API.
   */
  holdExecution(listener: (event: HostEvent) => void | Promise<void>): () => void {
    this.barriers.push(listener);
    return () => {
      removeListener(this.barriers, listener);
    };
  }

  diagnostics(): RuntimeDiagnostics {
    return {
      initializationMs: this.initializationMs,
      modelInvocations: this.modelInvocations,
      toolInvocations: this.toolInvocations,
      modelDurationMs: this.modelDurationMs,
      toolDurationMs: this.toolDurationMs,
      lastModelMs: this.lastModelMs,
      lastToolMs: this.lastToolMs,
      lastTimeToFirstTokenMs: this.lastTimeToFirstTokenMs,
      recoveryMs: this.recoveryMs,
    };
  }

  async emit(event: HostEvent): Promise<void> {
    for (const listener of [...this.observers]) {
      try {
        const result = listener(event);
        if (isPromise(result)) {
          void result.then(
            () => undefined,
            () => undefined,
          );
        }
      } catch {
        // A diagnostics listener cannot stop the durable run.
      }
    }
    for (const barrier of [...this.barriers]) {
      try {
        await barrier(event);
      } catch {
        // A broken development barrier cannot stop the durable run.
      }
    }
  }

  recordModel(durationMs: number, timeToFirstTokenMs: number | null): void {
    this.modelInvocations += 1;
    this.modelDurationMs += durationMs;
    this.lastModelMs = durationMs;
    this.lastTimeToFirstTokenMs = timeToFirstTokenMs;
  }

  recordTool(durationMs: number): void {
    this.toolInvocations += 1;
    this.toolDurationMs += durationMs;
    this.lastToolMs = durationMs;
  }

  async close(): Promise<void> {
    if (!this.opened) {
      return;
    }
    this.generation += 1;
    this.opened = false;
    for (const run of this.runs.values()) {
      run.dispose();
    }
    this.runs.clear();
    this.drivers.clear();
    this.runLocks.clear();
    this.agents.clear();
    this.suspended = false;
    const waiting = this.foreground;
    this.foreground = [];
    for (const wake of waiting) {
      wake();
    }
    await this.call("close", {});
  }

  setSuspended(suspended: boolean): void {
    this.suspended = suspended;
    if (!suspended) {
      const waiting = this.foreground;
      this.foreground = [];
      for (const wake of waiting) {
        wake();
      }
    }
  }

  currentRun(runId: string): Run | undefined {
    const run = this.runs.get(runId);
    if (run === undefined || run.generation !== this.generation) {
      return undefined;
    }
    return run;
  }

  /**
   * Serialize attach operations for one run id. The next caller waits for the
   * previous body, including when that body fails.
   */
  lockRun<T>(runId: string, body: () => Promise<T>): Promise<T> {
    const previous = this.runLocks.get(runId) ?? Promise.resolve();
    const next = previous.then(body, body);
    this.runLocks.set(
      runId,
      next.then(
        () => undefined,
        () => undefined,
      ),
    );
    return next;
  }

  /** One looping driver per run id. A second Run object joins the first. */
  acquireDriver(run: Run): boolean {
    const current = this.drivers.get(run.runId);
    if (current === run) {
      return true;
    }
    if (current !== undefined && current.generation === run.generation) {
      return false;
    }
    this.drivers.set(run.runId, run);
    return true;
  }

  ownedDriver(runId: string): Run {
    const driver = this.drivers.get(runId);
    if (driver === undefined) {
      throw permanent("The host driver for this run is missing.");
    }
    return driver;
  }

  adopt(run: Run): void {
    this.runs.set(run.runId, run);
  }

  agentFor(name: string, version: number): RegisteredAgent {
    const agent = this.agents.get(agentKey(name, version));
    if (agent === undefined) {
      throw new LarkxError({
        code: "unknown_workflow_version",
        message: `Register agent ${name}@${String(version)} before recovering this run.`,
        retryable: false,
      });
    }
    return agent;
  }

  now(): number {
    return this.clock();
  }

  online(): Promise<boolean> {
    return Promise.resolve(this.isOnline());
  }

  sleep(milliseconds: number): Promise<void> {
    if (milliseconds <= 0) {
      return Promise.resolve();
    }
    return this.sleeper(milliseconds);
  }

  isSuspended(): boolean {
    return this.suspended;
  }

  waitUntilActive(): Promise<void> {
    if (!this.suspended) {
      return Promise.resolve();
    }
    return holdOpen(
      new Promise((resolve) => {
        this.foreground.push(resolve);
      }),
    );
  }

  ensureGeneration(generation: number): void {
    if (!this.opened || generation !== this.generation) {
      throw closedError();
    }
  }

  private ensureOpen(): void {
    if (!this.opened) {
      throw closedError();
    }
  }

  async call(method: string, args: { readonly [key: string]: JsonValue }): Promise<string> {
    try {
      return await this.transport.invoke(method, args);
    } catch (error) {
      throw nativeError(error);
    }
  }

  async inspect(runId: string): Promise<RunStatus> {
    return readStatus(await this.call("inspect", { runId }));
  }

  async readResult(runId: string): Promise<AgentResult> {
    return readAgentResult(await this.call("result", { runId }));
  }
}

export class Agent {
  constructor(
    private readonly runtime: Runtime,
    private readonly registered: RegisteredAgent,
    private readonly ready: Promise<void>,
  ) {}

  get name(): string {
    return this.registered.name;
  }

  get version(): number {
    return this.registered.version;
  }

  /** Resolves when the native runtime has stored this agent definition. */
  whenRegistered(): Promise<void> {
    return this.ready;
  }

  /**
   * Persist the run, then schedule its one host driver. `run.result()` waits
   * for that driver. It does not start a second one. Pass `defer` to persist
   * without scheduling. A second start with the same message returns the same
   * handle. A different message is rejected and does not start another driver.
   */
  async start(input: StartInput): Promise<Run> {
    if (input.message.trim().length === 0) {
      throw invalid("Agent input message must be a non-empty string.");
    }
    const runId = input.runId ?? createRunId();
    const generation = this.runtime.generationId;
    return this.runtime.lockRun(runId, async () => {
      await this.ready;
      this.runtime.ensureGeneration(generation);
      const existing = this.runtime.currentRun(runId);
      await this.runtime.call("start", {
        name: this.registered.name,
        version: this.registered.version,
        runId,
        inputJson: JSON.stringify({ message: input.message }),
        nowMs: this.runtime.now(),
      });
      if (existing !== undefined) {
        if (input.defer !== true) {
          existing.schedule();
        }
        return existing;
      }
      const run = new Run(this.runtime, runId, this.registered, generation);
      this.runtime.adopt(run);
      if (input.defer !== true) {
        run.schedule();
      }
      return run;
    });
  }
}

export class Run {
  private driving: Promise<void> | null = null;
  private settled: Settlement | null = null;
  private waiters: Array<(settlement: Settlement) => void> = [];
  private pauseRequested = false;
  private cancelRequested = false;
  private resumeEpoch = 0;
  private pauseWaiters: Array<() => void> = [];
  private inflight: AbortController | null = null;
  private reconcileWait: {
    resolve(value: ReconcileInput): void;
    reject(error: LarkxError): void;
  } | null = null;
  private inputWait: {
    resolve(value: string): void;
    reject(error: LarkxError): void;
  } | null = null;
  private pendingInput: string | null = null;

  constructor(
    private readonly runtime: Runtime,
    readonly runId: string,
    private agent: RegisteredAgent,
    readonly generation: number,
  ) {}

  notePaused(): void {
    this.pauseRequested = true;
  }

  dispose(): void {
    this.inflight?.abort();
    this.pauseRequested = false;
    this.resumeEpoch += 1;
    this.wakePause();
    this.reconcileWait?.reject(closedError());
    this.reconcileWait = null;
    this.inputWait?.reject(closedError());
    this.inputWait = null;
    if (!this.settled) {
      this.finish({ ok: false, error: closedError() });
    }
  }

  /**
   * Wait for the terminal result. The driver is started by `agent.start()` or
   * `run.schedule()`, once per run id. This method does not start execution.
   */
  result(): Promise<AgentResult> {
    if (this.settled) {
      return this.settled.ok
        ? Promise.resolve(this.settled.value)
        : Promise.reject(this.settled.error);
    }
    return new Promise((resolve, reject) => {
      if (this.settled) {
        if (this.settled.ok) {
          resolve(this.settled.value);
        } else {
          reject(this.settled.error);
        }
        return;
      }
      this.waiters.push((settlement) => {
        if (settlement.ok) {
          resolve(settlement.value);
        } else {
          reject(settlement.error);
        }
      });
    });
  }

  async pause(): Promise<void> {
    this.runtime.ensureGeneration(this.generation);
    this.pauseRequested = true;
    if (this.inflight === null) {
      await this.runtime.call("pause", { runId: this.runId, nowMs: this.runtime.now() });
    }
  }

  async resume(): Promise<void> {
    this.runtime.ensureGeneration(this.generation);
    this.pauseRequested = false;
    this.resumeEpoch += 1;
    await this.runtime.call("resume", { runId: this.runId, nowMs: this.runtime.now() });
    this.schedule();
    this.wakePause();
  }

  /** Start the one host driver for this run id. A second call joins that driver. */
  schedule(): void {
    this.start();
  }

  async cancel(): Promise<void> {
    this.runtime.ensureGeneration(this.generation);
    this.cancelRequested = true;
    this.pauseRequested = false;
    this.resumeEpoch += 1;
    this.inflight?.abort();
    this.wakePause();
    this.reconcileWait?.reject(cancelled("Execution cancelled."));
    this.reconcileWait = null;
    this.inputWait?.reject(cancelled("Execution cancelled."));
    this.inputWait = null;
    await this.runtime.call("cancel", { runId: this.runId, nowMs: this.runtime.now() });
  }

  /**
   * Answers one remote input request with text meant for that remote agent.
   * The text is not the local conversation. A2A sends it on the existing task.
   */
  async provideInput(text: string): Promise<void> {
    this.runtime.ensureGeneration(this.generation);
    if (text.trim().length === 0) {
      throw new LarkxError({
        code: "invalid_workflow_definition",
        message: "Remote input must include text.",
        retryable: false,
      });
    }
    if (this.inputWait === null) {
      this.pendingInput = text;
      return;
    }
    const waiting = this.inputWait;
    this.inputWait = null;
    waiting.resolve(text);
  }

  private takeInput(): Promise<string> {
    if (this.pendingInput !== null) {
      const text = this.pendingInput;
      this.pendingInput = null;
      return Promise.resolve(text);
    }
    return new Promise<string>((resolve, reject) => {
      this.inputWait = { resolve, reject };
    });
  }

  async reconcile(input: ReconcileInput): Promise<void> {
    this.runtime.ensureGeneration(this.generation);
    if (this.reconcileWait === null) {
      throw new LarkxError({
        code: "invalid_state_transition",
        message: "This run is not waiting for reconciliation.",
        retryable: false,
      });
    }
    const waiting = this.reconcileWait;
    this.reconcileWait = null;
    waiting.resolve(input);
  }

  async getDelegations(): Promise<readonly DelegationView[]> {
    this.runtime.ensureGeneration(this.generation);
    const parsed = JSON.parse(
      await this.runtime.call("delegations", { runId: this.runId }),
    ) as unknown;
    if (!Array.isArray(parsed)) {
      throw permanent("Delegation list was not an array.");
    }
    return parsed.map((item) => {
      const record = readRecord(item, "Delegation");
      const taskId = record.taskId;
      const contextId = record.contextId;
      const prompt = record.prompt;
      const remoteIdentity = record.remoteIdentity;
      const remoteStatus = record.remoteStatus;
      return {
        cancelIntent: readBoolean(record, "cancelIntent"),
        contextId: typeof contextId === "string" ? contextId : null,
        endpoint: readString(record, "endpoint"),
        operationId: readString(record, "operationId"),
        prompt: typeof prompt === "string" ? prompt : null,
        remoteAgent: readString(record, "remoteAgent"),
        remoteIdentity: typeof remoteIdentity === "string" ? remoteIdentity : null,
        remoteStatus: typeof remoteStatus === "string" ? remoteStatus : null,
        state: readString(record, "state"),
        stepKey: readString(record, "stepKey"),
        taskId: typeof taskId === "string" ? taskId : null,
        transport: readString(record, "transport"),
      };
    });
  }

  async getStatus(): Promise<RunStatus> {
    this.runtime.ensureGeneration(this.generation);
    return this.runtime.inspect(this.runId);
  }

  async getHistory(): Promise<RunHistory> {
    this.runtime.ensureGeneration(this.generation);
    const stepCount = readCount(await this.runtime.call("stepCount", { runId: this.runId }));
    const steps: HistoryStep[] = [];
    for (let index = 0; index < stepCount; index += 1) {
      const info = readStep(await this.runtime.call("stepAt", { runId: this.runId, index }));
      let output: JsonValue | null = null;
      try {
        output = JSON.parse(
          await this.runtime.call("stepOutput", { runId: this.runId, stepKey: info.stepKey }),
        ) as JsonValue;
      } catch {
        output = null;
      }
      steps.push({ ...info, output });
    }
    const eventCount = readCount(await this.runtime.call("eventCount", { runId: this.runId }));
    const events: HistoryEvent[] = [];
    for (let index = 0; index < eventCount; index += 1) {
      const payload = JSON.parse(
        await this.runtime.call("eventPayload", { runId: this.runId, index }),
      ) as JsonValue;
      events.push({ index, payload });
    }
    return { steps, events };
  }

  private start(): void {
    if (this.driving !== null || this.settled !== null) {
      return;
    }
    if (!this.runtime.acquireDriver(this)) {
      const owner = this.runtime.ownedDriver(this.runId);
      this.driving = owner.result().then(
        (value) => {
          this.finish({ ok: true, value });
        },
        (error: unknown) => {
          this.finish({
            ok: false,
            error: error instanceof LarkxError ? error : nativeError(error),
          });
        },
      );
      return;
    }
    this.driving = Promise.resolve();
    const loop = this.loop();
    this.driving = loop.then(
      () => undefined,
      () => undefined,
    );
  }

  private async loop(): Promise<void> {
    try {
      await this.runtime.emit({ type: "run-started", runId: this.runId, atMs: this.runtime.now() });
      const info = await this.runtime.inspect(this.runId);
      if (info.status === "COMPLETED") {
        this.finish({ ok: true, value: await this.runtime.readResult(this.runId) });
        return;
      }
      if (info.status === "FAILED" || info.status === "CANCELLED") {
        this.finish({ ok: false, error: terminalError(info) });
        return;
      }
      for (;;) {
        this.runtime.ensureGeneration(this.generation);
        if (this.pauseRequested && this.inflight === null) {
          await this.runtime.emit({
            type: "run-paused",
            runId: this.runId,
            atMs: this.runtime.now(),
          });
          await this.runtime.call("pause", { runId: this.runId, nowMs: this.runtime.now() });
        }
        const request = readDrive(
          await this.runtime.call("drive", { runId: this.runId, nowMs: this.runtime.now() }),
        );
        if (request.kind === RequestKind.Paused) {
          this.pauseRequested = true;
          await this.waitUntilResumed();
          continue;
        }
        await this.handle(request);
        if (this.settled) {
          return;
        }
      }
    } catch (error) {
      this.finish({ ok: false, error: error instanceof LarkxError ? error : nativeError(error) });
    }
  }

  private async handle(request: DriveRequest): Promise<void> {
    switch (request.kind) {
      case RequestKind.Complete:
        await this.runtime.emit(this.event("before-completion", request));
        this.finish({ ok: true, value: await this.runtime.readResult(this.runId) });
        return;
      case RequestKind.Failed:
      case RequestKind.Blocked:
        throw errorFromDetail(request);
      case RequestKind.Cancelled:
        throw cancelled("Execution cancelled.");
      case RequestKind.Wait: {
        const waiting = readWaiting(request.detailJson);
        if (waiting !== undefined) {
          await this.runtime.emit({
            ...this.event("remote-waiting", request),
            waitingFor: waiting,
          });
        }
        if (request.hasWaitUntil && request.waitUntilMs > this.runtime.now()) {
          await this.runtime.sleep(request.waitUntilMs - this.runtime.now());
        }
        return;
      }
      case RequestKind.Delegate:
        await this.invokeDelegation(request);
        return;
      case RequestKind.Reconcile: {
        const detail = readRecord(JSON.parse(request.detailJson) as unknown, "Reconcile request");
        if (detail.reason === "remote_input_required") {
          await this.runtime.emit({
            ...this.event("remote-input-required", request),
            ...(typeof detail.prompt === "string" ? { prompt: detail.prompt } : {}),
            ...(typeof detail.taskId === "string" ? { taskId: detail.taskId } : {}),
          });
          const text = await this.takeInput();
          await this.runtime.call("provideInput", {
            runId: this.runId,
            stepKey: request.stepKey,
            text,
            nowMs: this.runtime.now(),
          });
          return;
        }
        await this.runtime.emit(this.event("reconcile-required", request));
        await this.awaitReconcile(request);
        return;
      }
      case RequestKind.InvokeModel:
        if (request.attempt > 1) {
          await this.runtime.emit(this.event("retry", request));
        }
        await this.invokeModel(request);
        return;
      case RequestKind.InvokeTool:
        if (request.attempt > 1) {
          await this.runtime.emit(this.event("retry", request));
        }
        await this.invokeTool(request);
        return;
      default:
        throw permanent(`Native runtime returned an unknown request kind ${String(request.kind)}.`);
    }
  }

  private async invokeModel(request: DriveRequest): Promise<void> {
    await this.beforeHostWork();
    if (this.shouldCancel(request)) {
      await this.submitModel(request, null, "cancelled_execution", "Model call cancelled.", false);
      return;
    }
    const controller = new AbortController();
    this.inflight = controller;
    try {
      await this.runtime.emit(this.event("model-requested", request));
      const detail = JSON.parse(request.detailJson) as ModelRequest;
      const started = Date.now();
      const response = await this.agent.model.complete(
        { messages: detail.messages ?? [], tools: detail.tools ?? [] },
        { signal: controller.signal },
      );
      const duration = Date.now() - started;
      this.runtime.recordModel(
        duration,
        typeof response.timingMs?.timeToFirstToken === "number"
          ? response.timingMs.timeToFirstToken
          : null,
      );
      if (this.shouldCancel(request) || controller.signal.aborted) {
        await this.submitModel(
          request,
          null,
          "cancelled_execution",
          "Model call cancelled.",
          false,
        );
        return;
      }
      await this.submitModel(request, response, "", "", false);
      await this.runtime.emit(this.event("model-committed", request));
    } catch (error) {
      if (!this.alive()) {
        return;
      }
      if (this.shouldCancel(request) || isAbort(error) || controller.signal.aborted) {
        await this.submitModel(
          request,
          null,
          "cancelled_execution",
          "Model call cancelled.",
          false,
        );
        return;
      }
      const failure = error instanceof LarkxError ? error : permanent(messageOf(error));
      await this.submitModel(request, null, failure.code, failure.message, failure.retryable);
    } finally {
      this.inflight = null;
      await this.pauseIfRequested();
    }
  }

  private async invokeDelegation(request: DriveRequest): Promise<void> {
    await this.beforeHostWork();
    const detail = readRecord(JSON.parse(request.detailJson) as unknown, "Delegation request");
    const command = readDelegation(detail);
    const remote = this.agent.remotes.get(command.remoteAgent);
    const authorized =
      remote !== undefined &&
      remote.transport.endpoint === command.endpoint &&
      remote.transport.type === command.transport &&
      transportId(remote.transport) === command.transportId;
    if (!authorized || remote === undefined) {
      await this.submitDelegation(request, {
        action: command.action,
        outcome: "unauthorized",
        message: "The remote destination is not authorized.",
      });
      return;
    }
    const controller = new AbortController();
    this.inflight = controller;
    try {
      await this.runtime.emit({
        ...this.event("remote-requested", request),
        action: command.action,
        ...(command.taskId !== undefined ? { taskId: command.taskId } : {}),
      });
      const report =
        remote.transport.type === "a2a"
          ? await performA2aDelegation({
              command,
              transport: remote.transport,
              signal: controller.signal,
              online: () => this.runtime.online(),
            })
          : await performHttpDelegation({
              command,
              transport: remote.transport,
              signal: controller.signal,
              online: () => this.runtime.online(),
            });
      if (!this.alive()) {
        return;
      }
      await this.runtime.emit({
        ...this.event("remote-response", request),
        action: command.action,
        outcome: report.outcome,
        ...(report.taskId !== undefined ? { taskId: report.taskId } : {}),
      });
      await this.submitDelegation(request, { action: command.action, ...report });
    } catch (error) {
      if (!this.alive()) {
        return;
      }
      const failure = error instanceof LarkxError ? error : permanent(messageOf(error));
      await this.submitDelegation(request, {
        action: command.action,
        outcome: "invalid",
        message: failure.message,
      });
    } finally {
      this.inflight = null;
      await this.pauseIfRequested();
    }
  }

  private async submitDelegation(
    request: DriveRequest,
    body: {
      readonly action: string;
      readonly outcome: string;
      readonly taskId?: string;
      readonly contextId?: string;
      readonly remoteStatus?: string;
      readonly remoteIdentity?: string;
      readonly result?: JsonValue;
      readonly message?: string;
    },
  ): Promise<void> {
    if (!this.alive()) {
      return;
    }
    await this.runtime.call("submitDelegation", {
      runId: this.runId,
      requestId: request.requestId,
      bodyJson: JSON.stringify(body),
      nowMs: this.runtime.now(),
    });
  }

  private async invokeTool(request: DriveRequest): Promise<void> {
    await this.beforeHostWork();
    const detail = readRecord(JSON.parse(request.detailJson) as unknown, "Tool request");
    const name = readString(detail, "name");
    const tool = this.agent.tools.get(name);
    if (tool === undefined) {
      await this.submitTool(
        request,
        null,
        "permanent_execution_failure",
        `Tool "${name}" is not registered in this process.`,
        false,
      );
      return;
    }
    if (this.shouldCancel(request)) {
      await this.submitTool(request, null, "cancelled_execution", "Tool call cancelled.", false);
      return;
    }
    const controller = new AbortController();
    this.inflight = controller;
    try {
      await this.runtime.emit(this.event("tool-requested", request));
      const started = Date.now();
      const output = await tool.handler(detail.arguments ?? null, {
        operationId: readString(detail, "operationId"),
        attempt: readNumber(detail, "attempt"),
        runId: readString(detail, "runId"),
        stepKey: readString(detail, "stepKey"),
        callId: readString(detail, "callId"),
        signal: controller.signal,
      });
      this.runtime.recordTool(Date.now() - started);
      if (this.shouldCancel(request) || controller.signal.aborted) {
        await this.submitTool(request, null, "cancelled_execution", "Tool call cancelled.", false);
        return;
      }
      await this.submitTool(request, output, "", "", false);
      await this.runtime.emit(this.event("tool-committed", request));
    } catch (error) {
      if (!this.alive()) {
        return;
      }
      if (error instanceof ToolFailure) {
        await this.submitTool(request, null, error.code, error.message, error.retryable);
        return;
      }
      if (this.shouldCancel(request) || isAbort(error) || controller.signal.aborted) {
        await this.submitTool(request, null, "cancelled_execution", "Tool call cancelled.", false);
        return;
      }
      const failure = error instanceof LarkxError ? error : permanent(messageOf(error));
      await this.submitTool(request, null, failure.code, failure.message, failure.retryable);
    } finally {
      this.inflight = null;
      await this.pauseIfRequested();
    }
  }

  private async awaitReconcile(request: DriveRequest): Promise<void> {
    const decision = await holdOpen(
      new Promise<ReconcileInput>((resolve, reject) => {
        this.reconcileWait = { resolve, reject };
      }),
    );
    this.runtime.ensureGeneration(this.generation);
    await this.runtime.call("submitReconcile", {
      runId: this.runId,
      requestId: request.requestId,
      resolution: decision.resolution,
      bodyJson: JSON.stringify(decision.output ?? null),
      message: decision.message ?? "",
      nowMs: this.runtime.now(),
    });
  }

  private async beforeHostWork(): Promise<void> {
    while (this.runtime.isSuspended()) {
      await this.runtime.waitUntilActive();
      this.runtime.ensureGeneration(this.generation);
    }
  }

  private async pauseIfRequested(): Promise<void> {
    if (!this.pauseRequested || !this.alive()) {
      return;
    }
    await this.runtime.call("pause", { runId: this.runId, nowMs: this.runtime.now() });
  }

  private shouldCancel(request: DriveRequest): boolean {
    return this.cancelRequested || request.cancelRequested;
  }

  private alive(): boolean {
    return this.runtime.generationId === this.generation;
  }

  private async submitModel(
    request: DriveRequest,
    response: ModelResponse | null,
    errorCode: string,
    errorMessage: string,
    retryable: boolean,
  ): Promise<void> {
    if (!this.alive()) {
      return;
    }
    await this.runtime.call("submitModel", {
      runId: this.runId,
      requestId: request.requestId,
      bodyJson:
        response === null
          ? ""
          : JSON.stringify({
              message: response.message,
              finish: response.finish,
              calls: response.calls,
            }),
      errorCode,
      errorMessage,
      retryable,
      nowMs: this.runtime.now(),
    });
  }

  private async submitTool(
    request: DriveRequest,
    output: JsonValue | null,
    errorCode: string,
    errorMessage: string,
    retryable: boolean,
  ): Promise<void> {
    if (!this.alive()) {
      return;
    }
    const body = output === null ? "null" : JSON.stringify(output);
    if (output !== null && body === undefined) {
      throw permanent("Tool output cannot be serialized.");
    }
    await this.runtime.call("submitTool", {
      runId: this.runId,
      requestId: request.requestId,
      bodyJson: body,
      errorCode,
      errorMessage,
      retryable,
      nowMs: this.runtime.now(),
    });
  }

  private async waitUntilResumed(): Promise<void> {
    const epoch = this.resumeEpoch;
    if (!this.pauseRequested || this.resumeEpoch !== epoch) {
      return;
    }
    await holdOpen(
      new Promise<void>((resolve) => {
        if (!this.pauseRequested || this.resumeEpoch !== epoch) {
          resolve();
          return;
        }
        this.pauseWaiters.push(resolve);
      }),
    );
  }

  private wakePause(): void {
    const waiting = this.pauseWaiters;
    this.pauseWaiters = [];
    for (const wake of waiting) {
      wake();
    }
  }

  private event(type: HostEvent["type"], request: DriveRequest): HostEvent {
    return {
      type,
      runId: this.runId,
      stepKey: request.stepKey,
      operationId: request.operationId,
      attempt: request.attempt,
      atMs: this.runtime.now(),
    };
  }

  private finish(settlement: Settlement): void {
    if (this.settled) {
      return;
    }
    this.settled = settlement;
    void this.runtime
      .emit({
        type: settlement.ok ? "run-completed" : "run-failed",
        runId: this.runId,
        status: settlement.ok ? "COMPLETED" : settlement.error.code,
        atMs: this.runtime.now(),
      })
      .then(
        () => undefined,
        () => undefined,
      );
    const waiting = this.waiters;
    this.waiters = [];
    for (const waiter of waiting) {
      waiter(settlement);
    }
  }
}

/** Keep a Node process alive while the host is waiting for the application. */
function holdOpen<T>(promise: Promise<T>): Promise<T> {
  const timer = setInterval(() => undefined, 2_147_483_647);
  return promise.finally(() => {
    clearInterval(timer);
  });
}

function removeListener(
  listeners: Array<(event: HostEvent) => void | Promise<void>>,
  listener: (event: HostEvent) => void | Promise<void>,
): void {
  const index = listeners.indexOf(listener);
  if (index >= 0) {
    listeners.splice(index, 1);
  }
}

function isPromise(value: void | Promise<void>): value is Promise<void> {
  return typeof value === "object" && value !== null && "then" in value;
}

function agentKey(name: string, version: number): string {
  return `${name}@${String(version)}`;
}

function createRunId(): string {
  return `run-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function invalid(message: string): LarkxError {
  return new LarkxError({ code: "invalid_workflow_definition", message, retryable: false });
}

function permanent(message: string): LarkxError {
  return new LarkxError({ code: "permanent_execution_failure", message, retryable: false });
}

function cancelled(message: string): LarkxError {
  return new LarkxError({ code: "cancelled_execution", message, retryable: false });
}

function closedError(): LarkxError {
  return new LarkxError({
    code: "invalid_state_transition",
    message: "The native runtime is closed.",
    retryable: false,
  });
}

function assertRetry(name: string, policy: RetryPolicy): void {
  if (!Number.isInteger(policy.maxAttempts) || policy.maxAttempts < 1) {
    throw invalid(`Tool "${name}" retry maxAttempts must be an integer >= 1.`);
  }
  if (
    policy.initialIntervalMs < 0 ||
    policy.maxIntervalMs < policy.initialIntervalMs ||
    (policy.backoff !== "fixed" && policy.backoff !== "exponential")
  ) {
    throw invalid(`Tool "${name}" retry policy is invalid.`);
  }
}

function nativeError(error: unknown): LarkxError {
  if (error instanceof LarkxError) {
    return error;
  }
  const code = typeof error === "object" && error !== null && "code" in error ? error.code : "";
  const message = messageOf(error);
  const nativeCode = typeof code === "string" ? code : "";
  return new LarkxError({
    code: mapNativeCode(nativeCode, message),
    message,
    retryable: false,
    details: nativeCode.length > 0 ? { nativeCode } : {},
  });
}

function mapNativeCode(code: string, message: string): ErrorCode {
  if (message.includes("Unknown agent version")) {
    return "unknown_workflow_version";
  }
  switch (code) {
    case "INVALID_ARGUMENT":
      return "invalid_workflow_definition";
    case "STATE":
      return "invalid_state_transition";
    case "OWNERSHIP":
      return "execution_ownership_conflict";
    case "STORAGE":
      return "storage_failure";
    case "NOT_FOUND":
      return "run_not_found";
    case "SERIALIZATION":
      return "serialization_failure";
    case "CAPACITY":
      return "permanent_execution_failure";
    default:
      return "permanent_execution_failure";
  }
}

function messageOf(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }
  return "Native host call failed.";
}

function isAbort(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

function terminalError(info: RunStatus): LarkxError {
  if (info.status === "CANCELLED") {
    return cancelled("Execution cancelled.");
  }
  const reason = info.blockedReason.trim().length > 0 ? info.blockedReason : "The run failed.";
  return permanent(reason);
}

function errorFromDetail(request: DriveRequest): LarkxError {
  try {
    const detail = readRecord(JSON.parse(request.detailJson) as unknown, "Run error");
    const codeValue = detail.code;
    const messageValue = detail.message;
    const code =
      typeof codeValue === "string" && isErrorCode(codeValue)
        ? codeValue
        : "permanent_execution_failure";
    const message = typeof messageValue === "string" ? messageValue : "The run failed.";
    return new LarkxError({ code, message, retryable: false });
  } catch {
    // The detail buffer is not an error object.
  }
  if (request.kind === RequestKind.Blocked) {
    return new LarkxError({
      code: "unknown_operation_outcome",
      message: request.detailJson || "The run is blocked.",
      retryable: false,
    });
  }
  return permanent(request.detailJson || "The run failed.");
}

function readDrive(text: string): DriveRequest {
  const value = readRecord(JSON.parse(text) as unknown, "Drive request");
  return {
    kind: readNumber(value, "kind"),
    requestId: readString(value, "requestId"),
    stepKey: readString(value, "stepKey"),
    operationId: readString(value, "operationId"),
    toolName: readString(value, "toolName"),
    attempt: readNumber(value, "attempt"),
    waitUntilMs: readNumber(value, "waitUntilMs"),
    hasWaitUntil: readBoolean(value, "hasWaitUntil"),
    effectType: readString(value, "effectType"),
    cancelRequested: readBoolean(value, "cancelRequested"),
    detailJson: readString(value, "detailJson"),
  };
}

function readStatus(text: string | unknown): RunStatus {
  const value = readRecord(
    typeof text === "string" ? (JSON.parse(text) as unknown) : text,
    "Run status",
  );
  return {
    runId: readString(value, "runId"),
    status: readString(value, "status"),
    workflowName: readString(value, "workflowName"),
    workflowVersion: readNumber(value, "workflowVersion"),
    cancelRequested: readBoolean(value, "cancelRequested"),
    ownershipEpoch: readNumber(value, "ownershipEpoch"),
    ownerId: readString(value, "ownerId"),
    blockedReason: readString(value, "blockedReason"),
  };
}

function readStep(text: string): Omit<HistoryStep, "output"> {
  const value = readRecord(JSON.parse(text) as unknown, "Step");
  return {
    stepKey: readString(value, "stepKey"),
    stepOrder: readNumber(value, "stepOrder"),
    status: readString(value, "status"),
    effectType: readString(value, "effectType"),
    operationId: readString(value, "operationId"),
    attemptCount: readNumber(value, "attemptCount"),
    executionTarget: readString(value, "executionTarget"),
  };
}

function readWaiting(detailJson: string): string | undefined {
  if (detailJson.trim().length === 0) {
    return undefined;
  }
  try {
    const value = JSON.parse(detailJson) as unknown;
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      return undefined;
    }
    const waiting = (value as { readonly waitingFor?: unknown }).waitingFor;
    return typeof waiting === "string" ? waiting : undefined;
  } catch {
    return undefined;
  }
}

function readDelegation(value: { readonly [key: string]: JsonValue }): DelegationCommand {
  const taskId = value.taskId;
  const contextId = value.contextId;
  const continuation = value.continuation;
  const transport = readString(value, "transport");
  if (transport !== "http" && transport !== "a2a") {
    throw permanent(`Remote transport "${transport}" is not supported.`);
  }
  const input = value.input ?? null;
  return {
    action: readString(value, "action"),
    ...(typeof contextId === "string" ? { contextId } : {}),
    ...(typeof continuation === "string" ? { continuation } : {}),
    endpoint: readString(value, "endpoint"),
    input,
    operationId: readString(value, "operationId"),
    pollIntervalMs: readNumber(value, "pollIntervalMs"),
    remoteAgent: readString(value, "remoteAgent"),
    ...(typeof taskId === "string" ? { taskId } : {}),
    transport,
    transportId: readString(value, "transportId"),
  };
}

function readAgentResult(text: string): AgentResult {
  const value = readRecord(JSON.parse(text) as unknown, "Agent result");
  const finish = readString(value, "finish");
  if (finish !== "stop" && finish !== "length") {
    throw permanent("Agent result finish is not stop or length.");
  }
  return {
    message: readString(value, "message"),
    finish,
    iterations: readNumber(value, "iterations"),
    toolCalls: readNumber(value, "toolCalls"),
  };
}

function readCount(text: string): number {
  const value = JSON.parse(text) as unknown;
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw permanent("Native runtime returned a bad count.");
  }
  return value;
}

function readRecord(value: unknown, label: string): { readonly [key: string]: JsonValue } {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw permanent(`${label} must be a JSON object.`);
  }
  return value as { readonly [key: string]: JsonValue };
}

function readString(value: { readonly [key: string]: JsonValue }, key: string): string {
  const field = value[key];
  if (typeof field !== "string") {
    throw permanent(`${key} must be a string.`);
  }
  return field;
}

function readNumber(value: unknown, key: string): number {
  const record = readRecord(value, key);
  const field = record[key];
  if (typeof field !== "number" || !Number.isFinite(field)) {
    throw permanent(`${key} must be a number.`);
  }
  return field;
}

function readBoolean(value: { readonly [key: string]: JsonValue }, key: string): boolean {
  const field = value[key];
  if (typeof field !== "boolean") {
    throw permanent(`${key} must be a boolean.`);
  }
  return field;
}
