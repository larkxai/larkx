import {
  LarkxError,
  PROTOCOL_VERSION,
  checkProtocolCompatibility,
  isRecoverableWorkflowStatus,
  isTerminalWorkflowStatus,
  strictestDataPolicy,
  validateRunId,
  validateStepKey,
  type DataPolicy,
  type ErrorCode,
  type JsonValue,
  type RuntimeCapabilities,
} from "@larkxai/protocol";

import { createSystemClock, type Clock } from "./clock.js";
import { projectJournal, type JournalDocument } from "./journal.js";
import { decodeJson, encodeJson, encodePayload } from "./json.js";
import type { ApplyOutcome, StorageCommand } from "./reduce.js";
import type {
  AttemptRecord,
  EventDraft,
  ExecutionEventRecord,
  ExecutionState,
  OwnershipFence,
  StepRecord,
  StoredError,
  WorkflowRunRecord,
} from "./records.js";
import { DEFAULT_RETRY, retryDelayMs, type RetryPolicy } from "./retry.js";
import type { ListRunsQuery, WorkflowStorage } from "./storage.js";
import type {
  LocalStepOptions,
  StepContext,
  StepOptions,
  AnyWorkflow,
  WorkflowContext,
  WorkflowDefinition,
} from "./workflow.js";

export class EngineTermination extends Error {
  constructor() {
    super("LarkX engine termination");
    this.name = "EngineTermination";
  }
}

export interface EngineHooks {
  beforeStepCommit?(info: StepHookInfo): Promise<void> | void;
  afterStepCommit?(info: StepHookInfo): Promise<void> | void;
  afterStepHandler?(info: StepHookInfo): Promise<void> | void;
}

export interface StepHookInfo {
  readonly runId: string;
  readonly stepKey: string;
  readonly attempt: number;
}

export interface EngineOptions {
  readonly storage: WorkflowStorage;
  readonly workflows: readonly AnyWorkflow[];
  readonly clock?: Clock;
  readonly ownerId?: string;
  readonly leaseMs?: number;
  readonly dataPolicy?: DataPolicy;
  readonly defaultRetry?: RetryPolicy;
  readonly hooks?: EngineHooks;
  readonly createId?: () => string;
  /** When false, a positive lease is not renewed. Used to test expiry. */
  readonly heartbeat?: boolean;
}

export interface StartRequest<TInput> {
  readonly id: string;
  readonly input: TInput;
}

export interface RunSnapshot {
  readonly runId: string;
  readonly workflowName: string;
  readonly workflowVersion: number;
  readonly status: WorkflowRunRecord["status"];
  readonly input: JsonValue;
  readonly output: JsonValue | null;
  readonly error: StoredError | null;
  readonly blockedReason: string | null;
  readonly createdAt: number;
  readonly updatedAt: number;
  readonly protocolVersion: number;
  readonly dataPolicy: DataPolicy;
  readonly ownerId: string | null;
  readonly ownershipEpoch: number;
  readonly cancelRequested: boolean;
}

export interface StepSnapshot {
  readonly stepKey: string;
  readonly stepOrder: number;
  readonly status: StepRecord["status"];
  readonly executionTarget: StepRecord["executionTarget"];
  readonly selectedTarget: StepRecord["selectedTarget"];
  readonly effectType: StepRecord["effectType"];
  readonly attemptCount: number;
  readonly operationId: string;
  readonly output: JsonValue | null;
  readonly error: StoredError | null;
}

export interface ReconcileResolution {
  readonly resolution: "retry" | "fail" | "complete";
  readonly output?: JsonValue;
  readonly message?: string;
}

export interface RunHandle<TOutput> {
  readonly id: string;
  result(): Promise<TOutput>;
  status(): Promise<WorkflowRunRecord["status"]>;
  cancel(): Promise<void>;
  getHistory(): Promise<ExecutionEventRecord[]>;
  subscribe(listener: (event: ExecutionEventRecord) => void): () => void;
}

export interface Engine {
  readonly ownerId: string;
  readonly capabilities: RuntimeCapabilities;
  start<TInput, TOutput>(
    workflow: WorkflowDefinition<TInput, TOutput>,
    request: StartRequest<TInput>,
  ): Promise<RunHandle<TOutput>>;
  resume(runId: string): Promise<RunHandle<unknown>>;
  recover(): Promise<RunHandle<unknown>[]>;
  getRun(runId: string): Promise<RunSnapshot | null>;
  listRuns(query?: ListRunsQuery): Promise<RunSnapshot[]>;
  cancel(runId: string): Promise<void>;
  subscribe(runId: string, listener: (event: ExecutionEventRecord) => void): () => void;
  getHistory(runId: string): Promise<ExecutionEventRecord[]>;
  getSteps(runId: string): Promise<StepSnapshot[]>;
  /**
   * Metadata projection of a committed run.
   * The result has no workflow input, step input, step output, error message, or owner id.
   */
  readJournal(runId: string): Promise<JournalDocument | null>;
  reconcileStep(runId: string, stepKey: string, resolution: ReconcileResolution): Promise<void>;
  /**
   * Register a workflow after the engine exists.
   * The same definition object may be registered again. A different object for
   * the same name and version is rejected.
   */
  register(workflow: AnyWorkflow): void;
  close(): Promise<void>;
}

class StopEngine extends Error {
  constructor() {
    super("LarkX engine is closing");
    this.name = "StopEngine";
  }
}

export function createEngine(options: EngineOptions): Engine {
  return new LocalEngine(options);
}

class LocalEngine implements Engine {
  readonly ownerId: string;
  readonly capabilities: RuntimeCapabilities;
  readonly storage: WorkflowStorage;
  readonly clock: Clock;
  private readonly leaseMs: number;
  private readonly dataPolicy: DataPolicy;
  readonly defaultRetry: RetryPolicy;
  readonly hooks: EngineHooks;
  readonly createId: () => string;
  private readonly heartbeat: boolean;
  private readonly registry = new Map<string, AnyWorkflow>();
  private readonly loops = new Map<string, Promise<void>>();
  private readonly locks = new Map<string, Promise<void>>();
  private readonly listeners = new Map<string, Set<(event: ExecutionEventRecord) => void>>();
  private readonly aborts = new Map<string, AbortController>();
  closed = false;

  constructor(options: EngineOptions) {
    this.storage = options.storage;
    this.clock = options.clock ?? createSystemClock();
    this.ownerId = options.ownerId ?? defaultId();
    this.leaseMs = options.leaseMs ?? 30_000;
    this.dataPolicy = options.dataPolicy ?? "device-only";
    this.defaultRetry = options.defaultRetry ?? DEFAULT_RETRY;
    this.hooks = options.hooks ?? {};
    this.createId = options.createId ?? defaultId;
    this.heartbeat = options.heartbeat ?? true;
    for (const workflow of options.workflows) {
      const key = registryKey(workflow.name, workflow.version);
      if (this.registry.has(key)) {
        throw new LarkxError({
          code: "invalid_workflow_definition",
          message: `Workflow ${workflow.name}@${String(workflow.version)} is registered more than once.`,
          retryable: false,
        });
      }
      this.registry.set(key, workflow);
    }
    this.capabilities = {
      protocolVersion: PROTOCOL_VERSION,
      executionTargets: ["local"],
      remoteDispatch: false,
      durableTime: true,
      storageKind: options.storage.kind,
    };
  }

  register(workflow: AnyWorkflow): void {
    this.assertOpen();
    const key = registryKey(workflow.name, workflow.version);
    const existing = this.registry.get(key);
    if (existing === workflow) {
      return;
    }
    if (existing) {
      throw new LarkxError({
        code: "invalid_workflow_definition",
        message: `Workflow ${workflow.name}@${String(workflow.version)} is registered more than once.`,
        retryable: false,
      });
    }
    this.registry.set(key, workflow);
  }

  async start<TInput, TOutput>(
    workflow: WorkflowDefinition<TInput, TOutput>,
    request: StartRequest<TInput>,
  ): Promise<RunHandle<TOutput>> {
    this.assertOpen();
    const idError = validateRunId(request.id);
    if (idError) {
      throw new LarkxError({
        code: "invalid_workflow_definition",
        message: idError,
        retryable: false,
      });
    }
    this.assertRegistered(workflow);
    const inputJson = encodeJson(request.input);
    await this.withRunLock(request.id, async () => {
      const existing = await this.storage.loadRun(request.id);
      if (!existing) {
        const created = await this.storage.createRun({
          runId: request.id,
          workflowName: workflow.name,
          workflowVersion: workflow.version,
          inputJson,
          nowMs: this.clock.now(),
          eventId: this.createId(),
          protocolVersion: PROTOCOL_VERSION,
          dataPolicy: strictestDataPolicy(this.dataPolicy, workflow.dataPolicy ?? this.dataPolicy),
        });
        this.publish(created.state.events);
      } else {
        assertCompatible(existing, workflow, inputJson);
      }
      const current = existing ?? (await this.storage.loadRun(request.id));
      if (current && isRecoverableWorkflowStatus(current.status)) {
        this.kick(request.id);
      }
    });
    return this.handle(request.id);
  }

  async resume(runId: string): Promise<RunHandle<unknown>> {
    this.assertOpen();
    await this.withRunLock(runId, async () => {
      const run = await this.storage.loadRun(runId);
      if (!run) {
        throw new LarkxError({
          code: "run_not_found",
          message: `Run ${runId} does not exist.`,
          retryable: false,
        });
      }
      if (isRecoverableWorkflowStatus(run.status)) {
        this.kick(runId);
      }
    });
    return this.handle(runId);
  }

  async recover(): Promise<RunHandle<unknown>[]> {
    this.assertOpen();
    const runs = await this.storage.listRecoverableRuns();
    const handles: RunHandle<unknown>[] = [];
    for (const run of runs) {
      handles.push(await this.resume(run.runId));
    }
    return handles;
  }

  async getRun(runId: string): Promise<RunSnapshot | null> {
    const run = await this.storage.loadRun(runId);
    return run ? toSnapshot(run) : null;
  }

  async listRuns(query?: ListRunsQuery): Promise<RunSnapshot[]> {
    const runs = await this.storage.listRuns(query);
    return runs.map(toSnapshot);
  }

  async cancel(runId: string): Promise<void> {
    const run = await this.storage.loadRun(runId);
    if (!run) {
      throw new LarkxError({
        code: "run_not_found",
        message: `Run ${runId} does not exist.`,
        retryable: false,
      });
    }
    if (run.status === "CANCELLED") {
      return;
    }
    if (run.status === "COMPLETED" || run.status === "FAILED") {
      throw new LarkxError({
        code: "invalid_state_transition",
        message: `Cannot cancel a ${run.status} run.`,
        retryable: false,
      });
    }
    await this.storage.requestCancel(runId, this.clock.now());
    this.aborts.get(runId)?.abort();
    if (this.loops.has(runId)) {
      return;
    }
    await this.withRunLock(runId, async () => {
      if (this.loops.has(runId)) {
        return;
      }
      const claim = await this.storage.claimOwnership(runId, this.claimRequest());
      if (!claim.acquired) {
        return;
      }
      const fence = { ownerId: this.ownerId, epoch: claim.epoch };
      try {
        const latest = await this.storage.loadExecution(runId);
        if (!latest || isTerminalWorkflowStatus(latest.run.status)) {
          return;
        }
        const outcome = await this.storage.apply(
          this.transition(latest, fence, "CANCELLED", "WORKFLOW_CANCELLED", {
            reason: "cancelled",
          }),
        );
        this.publish(outcome.events);
      } finally {
        await this.storage.releaseOwnership(runId, { fence, nowMs: this.clock.now() });
      }
    });
  }

  subscribe(runId: string, listener: (event: ExecutionEventRecord) => void): () => void {
    const set = this.listeners.get(runId) ?? new Set();
    set.add(listener);
    this.listeners.set(runId, set);
    return () => {
      set.delete(listener);
    };
  }

  async getHistory(runId: string): Promise<ExecutionEventRecord[]> {
    const state = await this.requireExecution(runId);
    return state.events.map((event) => ({ ...event, payload: { ...event.payload } }));
  }

  async getSteps(runId: string): Promise<StepSnapshot[]> {
    const state = await this.requireExecution(runId);
    return state.steps.map(toStepSnapshot);
  }

  async readJournal(runId: string): Promise<JournalDocument | null> {
    const state = await this.storage.loadExecution(runId);
    if (!state) {
      return null;
    }
    return projectJournal(state);
  }

  async reconcileStep(
    runId: string,
    stepKey: string,
    resolution: ReconcileResolution,
  ): Promise<void> {
    this.assertOpen();
    await this.withRunLock(runId, async () => {
      const claim = await this.storage.claimOwnership(runId, this.claimRequest());
      if (!claim.acquired) {
        throw new LarkxError({
          code: "execution_ownership_conflict",
          message: `Could not claim run ${runId} to reconcile step "${stepKey}".`,
          retryable: false,
        });
      }
      const fence = { ownerId: this.ownerId, epoch: claim.epoch };
      try {
        await this.requireExecution(runId);
        const outputJson =
          resolution.resolution === "complete" ? encodeJson(resolution.output ?? null) : null;
        const errorJson =
          resolution.resolution === "fail"
            ? encodeJson({
                code: "permanent_execution_failure",
                message: resolution.message ?? "Reconciled as failed.",
                retryable: false,
              })
            : null;
        const outcome = await this.storage.apply({
          type: "reconcile-step",
          runId,
          fence,
          nowMs: this.clock.now(),
          stepKey,
          resolution: resolution.resolution,
          ...(outputJson !== null ? { outputJson } : {}),
          ...(errorJson !== null ? { errorJson } : {}),
          event: this.draft("STEP_RECONCILED", {
            stepKey,
            resolution: resolution.resolution,
          }),
          runEvent: this.draft(
            resolution.resolution === "fail" ? "WORKFLOW_FAILED" : "WORKFLOW_STARTED",
            { stepKey, resolution: resolution.resolution },
          ),
        });
        this.publish(outcome.events);
      } finally {
        await this.storage.releaseOwnership(runId, { fence, nowMs: this.clock.now() });
      }
    });
  }

  async close(): Promise<void> {
    this.closed = true;
    await Promise.allSettled([...this.loops.values()]);
    await this.storage.close();
  }

  private handle<T>(runId: string): RunHandle<T> {
    return {
      id: runId,
      result: () => this.readResult<T>(runId),
      status: async () => (await this.requireRun(runId)).status,
      cancel: () => this.cancel(runId),
      getHistory: () => this.getHistory(runId),
      subscribe: (listener) => this.subscribe(runId, listener),
    };
  }

  private async readResult<T>(runId: string): Promise<T> {
    const loop = this.loops.get(runId);
    if (loop) {
      await loop;
    }
    const run = await this.requireRun(runId);
    if (run.status === "COMPLETED") {
      return decodeJson(run.outputJson ?? "null") as T;
    }
    if (run.status === "FAILED") {
      throw errorFromRecord(run);
    }
    if (run.status === "CANCELLED") {
      throw new LarkxError({
        code: "cancelled_execution",
        message: `Run ${runId} was cancelled.`,
        retryable: false,
      });
    }
    if (run.status === "BLOCKED") {
      throw errorFromRecord(run);
    }
    throw new LarkxError({
      code: "execution_ownership_conflict",
      message: `Run ${runId} is ${run.status} and this engine is not executing it.`,
      retryable: false,
    });
  }

  private kick(runId: string): void {
    if (this.closed || this.loops.has(runId)) {
      return;
    }
    const promise = this.execute(runId);
    this.loops.set(runId, promise);
    promise.finally(() => {
      if (this.loops.get(runId) === promise) {
        this.loops.delete(runId);
      }
    });
  }

  private async execute(runId: string): Promise<void> {
    const claim = await this.storage.claimOwnership(runId, this.claimRequest());
    if (!claim.acquired) {
      return;
    }
    const fence: OwnershipFence = { ownerId: this.ownerId, epoch: claim.epoch };
    const controller = new AbortController();
    this.aborts.set(runId, controller);
    const stopHeartbeat = this.startHeartbeat(runId, fence, controller);
    try {
      let state = await this.requireExecution(runId);
      if (isTerminalWorkflowStatus(state.run.status)) {
        return;
      }
      const definition = this.registry.get(
        registryKey(state.run.workflowName, state.run.workflowVersion),
      );
      if (!definition) {
        await this.block(
          state,
          fence,
          "unknown_workflow_version",
          "The workflow version that started this run is not registered.",
        );
        return;
      }
      const compatibility = checkProtocolCompatibility(state.run.protocolVersion);
      if (!compatibility.compatible) {
        await this.block(
          state,
          fence,
          "protocol_incompatible",
          compatibility.reason ?? "Protocol mismatch.",
        );
        return;
      }
      if (state.run.cancelRequested) {
        await this.publishOutcome(
          await this.storage.apply(
            this.transition(state, fence, "CANCELLED", "WORKFLOW_CANCELLED", {
              reason: "cancelled",
            }),
          ),
        );
        return;
      }
      if (state.run.status === "CREATED") {
        state = await this.publishOutcome(
          await this.storage.apply(
            this.transition(state, fence, "RUNNING", "WORKFLOW_STARTED", {
              workflowName: state.run.workflowName,
              workflowVersion: state.run.workflowVersion,
            }),
          ),
        );
      } else if (
        state.run.status === "RUNNING" ||
        state.run.status === "WAITING" ||
        state.run.status === "RECOVERING"
      ) {
        if (state.run.status !== "RECOVERING") {
          state = await this.publishOutcome(
            await this.storage.apply(
              this.transition(state, fence, "RECOVERING", "WORKFLOW_RECOVERED", {
                from: state.run.status,
              }),
            ),
          );
        }
        state = await this.publishOutcome(
          await this.storage.apply(
            this.transition(state, fence, "RUNNING", "WORKFLOW_STARTED", { resumed: true }),
          ),
        );
      } else {
        return;
      }

      try {
        state = await this.prepareInterrupted(state, fence);
        if (isTerminalWorkflowStatus(state.run.status) || state.run.status === "BLOCKED") {
          return;
        }
        assertHistory(state);

        const session = new ReplaySession(this, state, fence, definition, controller.signal);
        const output = await definition.run(session.context, decodeJson(state.run.inputJson));
        if (this.closed) {
          return;
        }
        const latest = await this.requireExecution(runId);
        if (latest.run.cancelRequested) {
          await this.publishOutcome(
            await this.storage.apply(
              this.transition(latest, fence, "CANCELLED", "WORKFLOW_CANCELLED", {
                reason: "cancelled",
              }),
            ),
          );
          return;
        }
        const outputJson = encodeJson(output === undefined ? null : output);
        await this.publishOutcome(
          await this.storage.apply({
            ...this.transition(latest, fence, "COMPLETED", "WORKFLOW_COMPLETED", {}),
            honorCancel: true,
            outputJson,
          }),
        );
      } catch (error) {
        await this.handleExecutionError(runId, fence, error);
      }
    } catch (error) {
      try {
        await this.handleExecutionError(runId, fence, error);
      } catch {
        // A second failure, usually a lost fence, must not reject recovery.
      }
    } finally {
      stopHeartbeat();
      this.aborts.delete(runId);
      await this.storage.releaseOwnership(runId, { fence, nowMs: this.clock.now() });
    }
  }

  private async prepareInterrupted(
    state: ExecutionState,
    fence: OwnershipFence,
  ): Promise<ExecutionState> {
    assertHistory(state);
    const last = state.steps[state.steps.length - 1];
    if (!last || last.status !== "RUNNING") {
      return state;
    }
    if (last.effectType === "non-idempotent") {
      const outcome = await this.storage.apply({
        type: "mark-unknown",
        runId: state.run.runId,
        fence,
        nowMs: this.clock.now(),
        stepKey: last.stepKey,
        attemptId: null,
        reason: "interrupted",
        blockedReason: encodeJson({
          code: "unknown_operation_outcome",
          message: `Non-idempotent step "${last.stepKey}" was interrupted before its result was committed.`,
        }),
        errorJson: encodeJson({
          code: "unknown_operation_outcome",
          message: "Interrupted before the step result was committed.",
          retryable: false,
        }),
        stepEvent: this.draft("STEP_OUTCOME_UNKNOWN", {
          stepKey: last.stepKey,
          effects: last.effectType,
          reason: "interrupted",
        }),
        runEvent: this.draft("WORKFLOW_BLOCKED", {
          stepKey: last.stepKey,
          code: "unknown_operation_outcome",
        }),
      });
      this.publish(outcome.events);
      return outcome.state;
    }
    const outcome = await this.storage.apply({
      type: "resolve-step",
      runId: state.run.runId,
      fence,
      nowMs: this.clock.now(),
      stepKey: last.stepKey,
      stepTo: "RETRY_SCHEDULED",
      attemptId: latestStartedAttempt(state, last.stepKey)?.attemptId ?? missingAttempt(),
      attemptStatus: "INTERRUPTED",
      nextAttemptAt: this.clock.now(),
      errorJson: encodeJson({
        code: "transient_execution_failure",
        message: "Step was interrupted before its result was committed.",
        retryable: true,
      }),
      event: this.draft("STEP_RETRY_SCHEDULED", {
        stepKey: last.stepKey,
        effects: last.effectType,
        reason: "interrupted",
      }),
    });
    this.publish(outcome.events);
    return outcome.state;
  }

  private async handleExecutionError(
    runId: string,
    fence: OwnershipFence,
    error: unknown,
  ): Promise<void> {
    if (error instanceof EngineTermination || error instanceof StopEngine) {
      return;
    }
    if (error instanceof LarkxError && error.code === "execution_ownership_conflict") {
      return;
    }
    const state = await this.storage.loadExecution(runId);
    if (!state || isTerminalWorkflowStatus(state.run.status) || state.run.status === "BLOCKED") {
      return;
    }
    if (error instanceof LarkxError && error.code === "cancelled_execution") {
      await this.publishOutcome(
        await this.storage.apply(
          this.transition(state, fence, "CANCELLED", "WORKFLOW_CANCELLED", { reason: "cancelled" }),
        ),
      );
      return;
    }
    if (
      error instanceof LarkxError &&
      (error.code === "replay_divergence" ||
        error.code === "history_integrity" ||
        error.code === "unknown_workflow_version" ||
        error.code === "protocol_incompatible" ||
        error.code === "unknown_operation_outcome")
    ) {
      await this.block(state, fence, error.code, error.message);
      return;
    }
    const stored = toStoredError(error);
    await this.publishOutcome(
      await this.storage.apply(
        this.transition(
          state,
          fence,
          "FAILED",
          "WORKFLOW_FAILED",
          { code: stored.code },
          encodeJson(stored),
        ),
      ),
    );
  }

  private async block(
    state: ExecutionState,
    fence: OwnershipFence,
    code: ErrorCode,
    message: string,
  ): Promise<void> {
    if (state.run.status === "BLOCKED" || isTerminalWorkflowStatus(state.run.status)) {
      return;
    }
    await this.publishOutcome(
      await this.storage.apply(
        this.transition(
          state,
          fence,
          "BLOCKED",
          "WORKFLOW_BLOCKED",
          { code },
          undefined,
          encodeJson({ code, message }),
        ),
      ),
    );
  }

  private transition(
    state: ExecutionState,
    fence: OwnershipFence,
    to: WorkflowRunRecord["status"],
    type: EventDraft["type"],
    payload: Record<string, JsonValue>,
    errorJson?: string,
    blockedReason?: string,
  ): StorageCommand {
    return {
      type: "transition-run",
      runId: state.run.runId,
      fence,
      nowMs: this.clock.now(),
      to,
      event: this.draft(type, payload),
      ...(errorJson !== undefined ? { errorJson } : {}),
      ...(blockedReason !== undefined ? { blockedReason } : {}),
    };
  }

  draft(type: EventDraft["type"], payload: Record<string, JsonValue>): EventDraft {
    return {
      eventId: this.createId(),
      type,
      createdAt: this.clock.now(),
      payload: encodePayload(payload),
    };
  }

  publishOutcome(outcome: ApplyOutcome): ExecutionState {
    this.publish(outcome.events);
    return outcome.state;
  }

  private publish(events: readonly ExecutionEventRecord[]): void {
    for (const event of events) {
      const listeners = this.listeners.get(event.runId);
      if (!listeners) {
        continue;
      }
      for (const listener of [...listeners]) {
        listener(event);
      }
    }
  }

  private startHeartbeat(
    runId: string,
    fence: OwnershipFence,
    controller: AbortController,
  ): () => void {
    if (!this.heartbeat || this.leaseMs <= 0) {
      return () => {};
    }
    let stopped = false;
    const interval = Math.max(10, Math.floor(this.leaseMs / 3));
    const loop = async (): Promise<void> => {
      while (!stopped) {
        try {
          await this.clock.sleep(interval, controller.signal);
        } catch {
          return;
        }
        if (stopped) {
          return;
        }
        const renewed = await this.storage.renewOwnership(runId, {
          fence,
          nowMs: this.clock.now(),
          leaseMs: this.leaseMs,
        });
        if (!renewed) {
          controller.abort();
          return;
        }
      }
    };
    void loop();
    return () => {
      stopped = true;
      // The sleep otherwise keeps the runtime alive until the next interval.
      controller.abort();
    };
  }

  private claimRequest(): { ownerId: string; nowMs: number; leaseMs: number } {
    return { ownerId: this.ownerId, nowMs: this.clock.now(), leaseMs: this.leaseMs };
  }

  private assertRegistered(workflow: AnyWorkflow): void {
    const registered = this.registry.get(registryKey(workflow.name, workflow.version));
    if (registered !== workflow) {
      throw new LarkxError({
        code: "invalid_workflow_definition",
        message: `Workflow ${workflow.name}@${String(workflow.version)} is not registered on this engine.`,
        retryable: false,
      });
    }
  }

  private assertOpen(): void {
    if (this.closed) {
      throw new StopEngine();
    }
  }

  private async requireRun(runId: string): Promise<WorkflowRunRecord> {
    const run = await this.storage.loadRun(runId);
    if (!run) {
      throw new LarkxError({
        code: "run_not_found",
        message: `Run ${runId} does not exist.`,
        retryable: false,
      });
    }
    return run;
  }

  private async requireExecution(runId: string): Promise<ExecutionState> {
    const state = await this.storage.loadExecution(runId);
    if (!state) {
      throw new LarkxError({
        code: "run_not_found",
        message: `Run ${runId} does not exist.`,
        retryable: false,
      });
    }
    return state;
  }

  private async withRunLock<T>(runId: string, fn: () => Promise<T>): Promise<T> {
    const previous = this.locks.get(runId) ?? Promise.resolve();
    let release = (): void => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const tail = previous.then(() => gate);
    this.locks.set(runId, tail);
    await previous;
    try {
      return await fn();
    } finally {
      release();
      if (this.locks.get(runId) === tail) {
        this.locks.delete(runId);
      }
    }
  }
}

class ReplaySession {
  readonly context: WorkflowContext;
  private state: ExecutionState;
  private cursor = 0;

  constructor(
    private readonly engine: LocalEngine,
    state: ExecutionState,
    private readonly fence: OwnershipFence,
    private readonly definition: AnyWorkflow,
    private readonly signal: AbortSignal,
  ) {
    this.state = state;
    this.context = {
      runId: state.run.runId,
      workflowName: state.run.workflowName,
      workflowVersion: state.run.workflowVersion,
      signal,
      step: (key, options) => this.step(key, options),
      now: (key) =>
        this.step(key, {
          execution: "local",
          effects: "pure",
          run: () => engine.clock.now(),
        }),
      random: (key) =>
        this.step(key, {
          execution: "local",
          effects: "pure",
          run: () => randomUnit(),
        }),
    };
  }

  private async step<T>(key: string, options: StepOptions<T>): Promise<T> {
    if (this.engine.closed) {
      throw new StopEngine();
    }
    const keyError = validateStepKey(key);
    if (keyError) {
      throw new LarkxError({
        code: "invalid_workflow_definition",
        message: keyError,
        retryable: false,
      });
    }
    await this.throwIfCancelled();
    const recordedAtCursor = this.state.steps[this.cursor];
    const existing = this.state.steps.find((step) => step.stepKey === key);
    if (existing && existing.stepOrder !== this.cursor) {
      throw new LarkxError({
        code: "replay_divergence",
        message: `Step "${key}" is already recorded at order ${String(existing.stepOrder)}.`,
        retryable: false,
      });
    }
    if (recordedAtCursor && recordedAtCursor.stepKey !== key) {
      throw new LarkxError({
        code: "replay_divergence",
        message: `Replay expected step "${recordedAtCursor.stepKey}" but the workflow requested "${key}".`,
        retryable: false,
      });
    }
    if (recordedAtCursor?.status === "COMPLETED") {
      assertSameContract(recordedAtCursor, options);
      this.cursor += 1;
      return decodeJson(recordedAtCursor.outputJson ?? "null") as T;
    }
    if (recordedAtCursor?.status === "FAILED") {
      throw errorFromJson(
        recordedAtCursor.errorJson,
        "permanent_execution_failure",
        `Step "${key}" previously failed.`,
      );
    }
    if (recordedAtCursor?.status === "UNKNOWN_OUTCOME") {
      throw new LarkxError({
        code: "unknown_operation_outcome",
        message: `Step "${key}" has an unknown outcome and must be reconciled.`,
        retryable: false,
      });
    }
    if (recordedAtCursor?.status === "CANCELLED") {
      throw new LarkxError({
        code: "cancelled_execution",
        message: `Step "${key}" was cancelled.`,
        retryable: false,
      });
    }
    if (
      recordedAtCursor &&
      recordedAtCursor.status !== "RETRY_SCHEDULED" &&
      recordedAtCursor.status !== "PENDING"
    ) {
      throw new LarkxError({
        code: "invalid_state_transition",
        message: `Cannot execute step "${key}" from ${recordedAtCursor.status}.`,
        retryable: false,
      });
    }
    if (options.execution !== "local") {
      if (
        this.state.run.dataPolicy === "device-only" ||
        this.definition.dataPolicy === "device-only"
      ) {
        throw new LarkxError({
          code: "permission_denied",
          message: "Data policy device-only forbids cloud and hybrid steps.",
          retryable: false,
        });
      }
      throw new LarkxError({
        code: "unsupported_capability",
        message: `Execution target "${options.execution}" is not implemented. This runtime executes local steps only.`,
        retryable: false,
      });
    }
    validateTimeout(options.timeoutMs);
    const local = options as LocalStepOptions<T>;
    const retry = local.retry ?? this.engine.defaultRetry;
    const operationId = recordedAtCursor?.operationId ?? this.engine.createId();
    const stepOrder = recordedAtCursor?.stepOrder ?? this.cursor;
    const descriptorJson = encodeJson({
      execution: local.execution,
      effects: local.effects,
      timeoutMs: local.timeoutMs ?? null,
    });

    while (true) {
      await this.throwIfCancelled();
      const current = this.state.steps.find((step) => step.stepKey === key);
      if (current?.nextAttemptAt != null && current.nextAttemptAt > this.engine.clock.now()) {
        await this.engine.clock.sleep(current.nextAttemptAt - this.engine.clock.now(), this.signal);
      }
      const attemptId = this.engine.createId();
      let started = false;
      try {
        const begun = await this.engine.storage.apply({
          type: "begin-step",
          runId: this.state.run.runId,
          fence: this.fence,
          nowMs: this.engine.clock.now(),
          stepKey: key,
          stepOrder,
          executionTarget: "local",
          selectedTarget: "local",
          effectType: local.effects,
          operationId,
          descriptorJson,
          inputJson: null,
          attemptId,
          event: this.engine.draft("STEP_STARTED", {
            stepKey: key,
            effects: local.effects,
            execution: "local",
            operationId,
          }),
        });
        this.state = this.engine.publishOutcome(begun);
        started = true;
        const attempt = this.state.attempts.find((item) => item.attemptId === attemptId);
        if (!attempt) {
          throw new LarkxError({
            code: "storage_failure",
            message: `Attempt ${attemptId} was not recorded.`,
            retryable: false,
          });
        }
        const stepContext: StepContext = {
          operationId,
          attempt: attempt.attemptNumber,
          runId: this.state.run.runId,
          stepKey: key,
          signal: this.signal,
          workflowName: this.state.run.workflowName,
          workflowVersion: this.state.run.workflowVersion,
        };
        const value = await withTimeout(
          Promise.resolve(local.run(stepContext)),
          local.timeoutMs,
          this.engine.clock,
          this.signal,
        );
        await this.engine.hooks.afterStepHandler?.({
          runId: this.state.run.runId,
          stepKey: key,
          attempt: attempt.attemptNumber,
        });
        const outputJson = encodeJson(value === undefined ? null : value);
        await this.engine.hooks.beforeStepCommit?.({
          runId: this.state.run.runId,
          stepKey: key,
          attempt: attempt.attemptNumber,
        });
        const committed = await this.engine.storage.apply({
          type: "commit-step",
          runId: this.state.run.runId,
          fence: this.fence,
          nowMs: this.engine.clock.now(),
          stepKey: key,
          attemptId,
          outputJson,
          event: this.engine.draft("STEP_COMPLETED", {
            stepKey: key,
            effects: local.effects,
            execution: "local",
            attempt: attempt.attemptNumber,
          }),
        });
        this.state = this.engine.publishOutcome(committed);
        await this.engine.hooks.afterStepCommit?.({
          runId: this.state.run.runId,
          stepKey: key,
          attempt: attempt.attemptNumber,
        });
        this.cursor += 1;
        return decodeJson(outputJson) as T;
      } catch (error) {
        if (!started || error instanceof EngineTermination || error instanceof StopEngine) {
          throw error;
        }
        if (error instanceof LarkxError && error.code === "execution_ownership_conflict") {
          throw error;
        }
        if (
          this.signal.aborted ||
          (error instanceof LarkxError && error.code === "cancelled_execution")
        ) {
          await this.resolveAttempt(
            key,
            attemptId,
            "CANCELLED",
            "CANCELLED",
            "cancelled_execution",
            "Step cancelled.",
            false,
          );
          throw new LarkxError({
            code: "cancelled_execution",
            message: `Step "${key}" was cancelled.`,
            retryable: false,
          });
        }
        const stored = toStoredError(error);
        const timedOut = error instanceof LarkxError && error.code === "step_timeout";
        if (local.effects === "non-idempotent" && (stored.retryable || timedOut)) {
          await this.markUnknown(key, attemptId, stored.message);
          throw new LarkxError({
            code: "unknown_operation_outcome",
            message: `Non-idempotent step "${key}" ended without a committed result.`,
            retryable: false,
            cause: error,
          });
        }
        const attemptNumber =
          this.state.attempts.find((item) => item.attemptId === attemptId)?.attemptNumber ?? 1;
        if (stored.retryable && attemptNumber < retry.maxAttempts) {
          const delay = retryDelayMs(retry, attemptNumber);
          const nextAttemptAt = this.engine.clock.now() + delay;
          await this.resolveAttempt(
            key,
            attemptId,
            "RETRY_SCHEDULED",
            "FAILED",
            stored.code,
            stored.message,
            true,
            nextAttemptAt,
          );
          await this.engine.clock.sleep(delay, this.signal);
          continue;
        }
        await this.resolveAttempt(
          key,
          attemptId,
          "FAILED",
          "FAILED",
          stored.code,
          stored.message,
          false,
          null,
          "FAILED",
        );
        throw new LarkxError({
          code: stored.retryable ? "transient_execution_failure" : (stored.code as ErrorCode),
          message: stored.message,
          retryable: false,
          cause: error,
        });
      }
    }
  }

  private async resolveAttempt(
    stepKey: string,
    attemptId: string,
    stepTo: "FAILED" | "RETRY_SCHEDULED" | "CANCELLED",
    attemptStatus: AttemptRecord["status"],
    code: string,
    message: string,
    retryable: boolean,
    nextAttemptAt: number | null = null,
    runTo?: "FAILED",
  ): Promise<void> {
    const errorJson = encodeJson({ code, message, retryable });
    const eventType =
      stepTo === "RETRY_SCHEDULED"
        ? "STEP_RETRY_SCHEDULED"
        : stepTo === "CANCELLED"
          ? "STEP_FAILED"
          : "STEP_FAILED";
    const outcome = await this.engine.storage.apply({
      type: "resolve-step",
      runId: this.state.run.runId,
      fence: this.fence,
      nowMs: this.engine.clock.now(),
      stepKey,
      attemptId,
      stepTo,
      attemptStatus,
      errorJson,
      nextAttemptAt,
      event: this.engine.draft(eventType, { stepKey, code, attemptStatus }),
      ...(runTo
        ? {
            runTo,
            runEvent: this.engine.draft("WORKFLOW_FAILED", { stepKey, code }),
          }
        : {}),
    });
    this.state = this.engine.publishOutcome(outcome);
  }

  private async markUnknown(stepKey: string, attemptId: string, message: string): Promise<void> {
    const outcome = await this.engine.storage.apply({
      type: "mark-unknown",
      runId: this.state.run.runId,
      fence: this.fence,
      nowMs: this.engine.clock.now(),
      stepKey,
      attemptId,
      reason: "uncommitted",
      blockedReason: encodeJson({
        code: "unknown_operation_outcome",
        message,
      }),
      errorJson: encodeJson({
        code: "unknown_operation_outcome",
        message,
        retryable: false,
      }),
      stepEvent: this.engine.draft("STEP_OUTCOME_UNKNOWN", { stepKey, reason: "uncommitted" }),
      runEvent: this.engine.draft("WORKFLOW_BLOCKED", {
        stepKey,
        code: "unknown_operation_outcome",
      }),
    });
    this.state = this.engine.publishOutcome(outcome);
  }

  private async throwIfCancelled(): Promise<void> {
    if (this.engine.closed) {
      throw new StopEngine();
    }
    if (this.signal.aborted || this.state.run.cancelRequested) {
      throw new LarkxError({
        code: "cancelled_execution",
        message: "Workflow cancelled.",
        retryable: false,
      });
    }
    const latest = await this.engine.storage.loadRun(this.state.run.runId);
    if (latest?.cancelRequested) {
      this.state = { ...this.state, run: latest };
      throw new LarkxError({
        code: "cancelled_execution",
        message: "Workflow cancelled.",
        retryable: false,
      });
    }
  }
}

function registryKey(name: string, version: number): string {
  return `${name}\u0000${String(version)}`;
}

function assertCompatible(
  existing: WorkflowRunRecord,
  workflow: AnyWorkflow,
  inputJson: string,
): void {
  if (
    existing.workflowName !== workflow.name ||
    existing.workflowVersion !== workflow.version ||
    existing.inputJson !== inputJson
  ) {
    throw new LarkxError({
      code: "incompatible_run",
      message: `Run ${existing.runId} belongs to ${existing.workflowName}@${String(existing.workflowVersion)} and does not match this start request.`,
      retryable: false,
    });
  }
}

function assertSameContract(step: StepRecord, options: StepOptions<unknown>): void {
  if (step.executionTarget !== options.execution || step.effectType !== options.effects) {
    throw new LarkxError({
      code: "replay_divergence",
      message: `Step "${step.stepKey}" was recorded as ${step.executionTarget}/${step.effectType} and the current code declares ${options.execution}/${options.effects}.`,
      retryable: false,
    });
  }
}

function assertHistory(state: ExecutionState): void {
  for (let index = 0; index < state.steps.length; index += 1) {
    const step = state.steps[index];
    if (!step || step.stepOrder !== index) {
      throw new LarkxError({
        code: "history_integrity",
        message: "Step order is not contiguous.",
        retryable: false,
      });
    }
    if (index < state.steps.length - 1 && step.status !== "COMPLETED") {
      throw new LarkxError({
        code: "history_integrity",
        message: `Only the last step may be incomplete. "${step.stepKey}" is ${step.status}.`,
        retryable: false,
      });
    }
  }
}

function latestStartedAttempt(state: ExecutionState, stepKey: string): AttemptRecord | undefined {
  for (let index = state.attempts.length - 1; index >= 0; index -= 1) {
    const attempt = state.attempts[index];
    if (attempt && attempt.stepKey === stepKey && attempt.status === "STARTED") {
      return attempt;
    }
  }
  return undefined;
}

function missingAttempt(): string {
  throw new LarkxError({
    code: "history_integrity",
    message: "A running step has no open attempt.",
    retryable: false,
  });
}

function validateTimeout(timeoutMs: number | undefined): void {
  if (timeoutMs === undefined) {
    return;
  }
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1) {
    throw new LarkxError({
      code: "invalid_workflow_definition",
      message: "timeoutMs must be a positive integer.",
      retryable: false,
    });
  }
}

function toStoredError(error: unknown): StoredError {
  if (error instanceof LarkxError) {
    return { code: error.code, message: error.message, retryable: error.retryable };
  }
  if (error instanceof Error) {
    return { code: "transient_execution_failure", message: error.message, retryable: true };
  }
  return {
    code: "transient_execution_failure",
    message: "Unknown execution error.",
    retryable: true,
  };
}

function errorFromRecord(run: WorkflowRunRecord): LarkxError {
  if (run.status === "BLOCKED") {
    const parsed = parseStored(run.blockedReason);
    const code = (parsed?.code ?? "unknown_operation_outcome") as ErrorCode;
    return new LarkxError({
      code,
      message: parsed?.message ?? `Run ${run.runId} is blocked.`,
      retryable: false,
    });
  }
  const parsed = parseStored(run.errorJson);
  return new LarkxError({
    code: (parsed?.code ?? "permanent_execution_failure") as ErrorCode,
    message: parsed?.message ?? `Run ${run.runId} failed.`,
    retryable: false,
  });
}

function errorFromJson(
  encoded: string | null,
  fallback: ErrorCode,
  fallbackMessage: string,
): LarkxError {
  const parsed = parseStored(encoded);
  return new LarkxError({
    code: (parsed?.code ?? fallback) as ErrorCode,
    message: parsed?.message ?? fallbackMessage,
    retryable: false,
  });
}

function parseStored(encoded: string | null): { code?: string; message?: string } | null {
  if (!encoded) {
    return null;
  }
  try {
    const value = decodeJson(encoded);
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      return null;
    }
    const code = value["code"];
    const message = value["message"];
    return {
      ...(typeof code === "string" ? { code } : {}),
      ...(typeof message === "string" ? { message } : {}),
    };
  } catch {
    return null;
  }
}

function toSnapshot(run: WorkflowRunRecord): RunSnapshot {
  const blocked = parseStored(run.blockedReason);
  return {
    runId: run.runId,
    workflowName: run.workflowName,
    workflowVersion: run.workflowVersion,
    status: run.status,
    input: decodeJson(run.inputJson),
    output: run.outputJson === null ? null : decodeJson(run.outputJson),
    error: run.errorJson === null ? null : parseError(run.errorJson),
    blockedReason: blocked?.message ?? run.blockedReason,
    createdAt: run.createdAt,
    updatedAt: run.updatedAt,
    protocolVersion: run.protocolVersion,
    dataPolicy: run.dataPolicy,
    ownerId: run.ownerId,
    ownershipEpoch: run.ownershipEpoch,
    cancelRequested: run.cancelRequested,
  };
}

function toStepSnapshot(step: StepRecord): StepSnapshot {
  return {
    stepKey: step.stepKey,
    stepOrder: step.stepOrder,
    status: step.status,
    executionTarget: step.executionTarget,
    selectedTarget: step.selectedTarget,
    effectType: step.effectType,
    attemptCount: step.attemptCount,
    operationId: step.operationId,
    output: step.outputJson === null ? null : decodeJson(step.outputJson),
    error: step.errorJson === null ? null : parseError(step.errorJson),
  };
}

function parseError(encoded: string): StoredError {
  const parsed = parseStored(encoded);
  return {
    code: parsed?.code ?? "permanent_execution_failure",
    message: parsed?.message ?? "Stored error.",
    retryable: false,
  };
}

interface CryptoHost {
  randomUUID?: () => string;
  getRandomValues?: (array: Uint32Array) => Uint32Array;
}

function hostCrypto(): CryptoHost | undefined {
  return (globalThis as { crypto?: CryptoHost }).crypto;
}

function defaultId(): string {
  const cryptoApi = hostCrypto();
  if (!cryptoApi || typeof cryptoApi.randomUUID !== "function") {
    throw new LarkxError({
      code: "unsupported_capability",
      message: "global crypto.randomUUID() is required.",
      retryable: false,
    });
  }
  return cryptoApi.randomUUID();
}

function randomUnit(): number {
  const cryptoApi = hostCrypto();
  if (!cryptoApi || typeof cryptoApi.getRandomValues !== "function") {
    throw new LarkxError({
      code: "unsupported_capability",
      message: "global crypto.getRandomValues() is required.",
      retryable: false,
    });
  }
  const bytes = new Uint32Array(1);
  cryptoApi.getRandomValues(bytes);
  return (bytes[0] ?? 0) / 2 ** 32;
}

async function withTimeout<T>(
  work: Promise<T>,
  timeoutMs: number | undefined,
  clock: Clock,
  signal: AbortSignal,
): Promise<T> {
  if (timeoutMs === undefined) {
    return work;
  }
  const controller = new AbortController();
  let settled = false;
  const guarded = work.then(
    (value) => {
      settled = true;
      return value;
    },
    (error: unknown) => {
      if (settled) {
        return pending<T>();
      }
      settled = true;
      throw error;
    },
  );
  const timeout = clock.sleep(timeoutMs, controller.signal).then(
    () => {
      if (settled) {
        return pending<T>();
      }
      settled = true;
      throw new LarkxError({
        code: "step_timeout",
        message: `Step timed out after ${String(timeoutMs)}ms.`,
        retryable: true,
      });
    },
    () => pending<T>(),
  );
  try {
    const value = await Promise.race([guarded, timeout]);
    if (signal.aborted) {
      throw new LarkxError({
        code: "cancelled_execution",
        message: "Step was cancelled.",
        retryable: false,
      });
    }
    return value;
  } finally {
    settled = true;
    controller.abort();
  }
}

function pending<T>(): Promise<T> {
  return new Promise<T>(() => {});
}
