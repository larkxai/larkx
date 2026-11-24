import {
  LarkxError,
  SENSITIVE_EVENT_KEYS,
  canTransitionStep,
  canTransitionWorkflow,
  isTerminalWorkflowStatus,
  type StepStatus,
  type WorkflowStatus,
} from "@larkxai/protocol";

import type {
  AttemptRecord,
  EventDraft,
  ExecutionEventRecord,
  ExecutionState,
  OutboxRecord,
  OwnershipFence,
  StepRecord,
  WorkflowRunRecord,
} from "./records.js";

export interface CreateRunInput {
  runId: string;
  workflowName: string;
  workflowVersion: number;
  inputJson: string;
  nowMs: number;
  eventId: string;
  protocolVersion: number;
  dataPolicy: WorkflowRunRecord["dataPolicy"];
}

export interface ClaimInput {
  ownerId: string;
  nowMs: number;
  leaseMs: number;
  maySteal: boolean;
  /**
   * When true, a different owner can take the run only if `maySteal` is true.
   * Lease expiry is not evidence that the previous executor stopped.
   * The same owner refreshes the lease and keeps its epoch, so an in-flight
   * handler can still commit after the app was suspended.
   */
  exclusive?: boolean;
}

export interface ClaimOutcome {
  state: ExecutionState;
  acquired: boolean;
  epoch: number;
  ownerId: string;
  leaseExpiresAt: number | null;
  reason?: "owned_by_other" | "terminal";
}

export interface StorageCommand {
  type:
    | "transition-run"
    | "begin-step"
    | "commit-step"
    | "resolve-step"
    | "mark-unknown"
    | "reconcile-step"
    | "insert-outbox";
  runId: string;
  fence: OwnershipFence;
  nowMs: number;
  to?: WorkflowStatus;
  event?: EventDraft;
  honorCancel?: boolean;
  outputJson?: string | null;
  errorJson?: string | null;
  blockedReason?: string | null;
  stepKey?: string;
  stepOrder?: number;
  executionTarget?: StepRecord["executionTarget"];
  selectedTarget?: StepRecord["selectedTarget"];
  effectType?: StepRecord["effectType"];
  operationId?: string;
  descriptorJson?: string;
  inputJson?: string | null;
  attemptId?: string | null;
  attemptStatus?: AttemptRecord["status"];
  stepTo?: StepStatus;
  nextAttemptAt?: number | null;
  runTo?: WorkflowStatus;
  runEvent?: EventDraft;
  stepEvent?: EventDraft;
  reason?: string;
  resolution?: "retry" | "fail" | "complete";
  message?: OutboxRecord;
}

export interface ApplyOutcome {
  state: ExecutionState;
  events: ExecutionEventRecord[];
  appliedStatus: WorkflowStatus;
  outbox: "inserted" | "deduplicated" | "unchanged";
}

const SENSITIVE = new Set<string>(SENSITIVE_EVENT_KEYS);

export function reduceCreateRun(
  existing: ExecutionState | null,
  input: CreateRunInput,
): { state: ExecutionState; created: boolean } {
  if (existing) {
    return { state: existing, created: false };
  }
  const run: WorkflowRunRecord = {
    runId: input.runId,
    workflowName: input.workflowName,
    workflowVersion: input.workflowVersion,
    inputJson: input.inputJson,
    status: "CREATED",
    outputJson: null,
    errorJson: null,
    blockedReason: null,
    createdAt: input.nowMs,
    updatedAt: input.nowMs,
    ownerId: null,
    ownershipEpoch: 0,
    leaseExpiresAt: null,
    protocolVersion: input.protocolVersion,
    dataPolicy: input.dataPolicy,
    cancelRequested: false,
  };
  const created = appendEvent(emptyState(run), {
    eventId: input.eventId,
    type: "WORKFLOW_CREATED",
    createdAt: input.nowMs,
    payload: {
      workflowName: input.workflowName,
      workflowVersion: input.workflowVersion,
      protocolVersion: input.protocolVersion,
      dataPolicy: input.dataPolicy,
    },
  });
  return { state: created, created: true };
}

export function reduceClaim(state: ExecutionState, input: ClaimInput): ClaimOutcome {
  const run = state.run;
  if (isTerminalWorkflowStatus(run.status)) {
    return {
      state,
      acquired: false,
      epoch: run.ownershipEpoch,
      ownerId: run.ownerId ?? input.ownerId,
      leaseExpiresAt: run.leaseExpiresAt,
      reason: "terminal",
    };
  }
  const active = leaseActive(run, input.nowMs);
  const sameOwner = run.ownerId !== null && run.ownerId === input.ownerId;
  if (sameOwner && (active || input.exclusive === true)) {
    const leaseExpiresAt = expiry(input.nowMs, input.leaseMs);
    return {
      state: {
        ...state,
        run: { ...run, leaseExpiresAt, updatedAt: input.nowMs },
      },
      acquired: true,
      epoch: run.ownershipEpoch,
      ownerId: input.ownerId,
      leaseExpiresAt,
    };
  }
  const otherOwner = run.ownerId !== null && run.ownerId !== input.ownerId;
  if (otherOwner && !input.maySteal && (active || input.exclusive === true)) {
    return {
      state,
      acquired: false,
      epoch: run.ownershipEpoch,
      ownerId: run.ownerId ?? input.ownerId,
      leaseExpiresAt: run.leaseExpiresAt,
      reason: "owned_by_other",
    };
  }
  const epoch = run.ownershipEpoch + 1;
  const leaseExpiresAt = expiry(input.nowMs, input.leaseMs);
  return {
    state: {
      ...state,
      run: {
        ...run,
        ownerId: input.ownerId,
        ownershipEpoch: epoch,
        leaseExpiresAt,
        updatedAt: input.nowMs,
      },
    },
    acquired: true,
    epoch,
    ownerId: input.ownerId,
    leaseExpiresAt,
  };
}

export function reduceRenew(
  state: ExecutionState,
  input: { fence: OwnershipFence; nowMs: number; leaseMs: number },
): { state: ExecutionState; renewed: boolean } {
  if (!fenceMatches(state.run, input.fence) || isTerminalWorkflowStatus(state.run.status)) {
    return { state, renewed: false };
  }
  return {
    state: {
      ...state,
      run: {
        ...state.run,
        leaseExpiresAt: expiry(input.nowMs, input.leaseMs),
        updatedAt: input.nowMs,
      },
    },
    renewed: true,
  };
}

export function reduceRelease(
  state: ExecutionState,
  input: { fence: OwnershipFence; nowMs: number },
): { state: ExecutionState; released: boolean } {
  if (!fenceMatches(state.run, input.fence)) {
    return { state, released: false };
  }
  return {
    state: {
      ...state,
      run: {
        ...state.run,
        ownerId: null,
        ownershipEpoch: state.run.ownershipEpoch + 1,
        leaseExpiresAt: null,
        updatedAt: input.nowMs,
      },
    },
    released: true,
  };
}

export function reduceRequestCancel(state: ExecutionState, nowMs: number): ExecutionState {
  if (isTerminalWorkflowStatus(state.run.status) || state.run.cancelRequested) {
    return state;
  }
  return {
    ...state,
    run: { ...state.run, cancelRequested: true, updatedAt: nowMs },
  };
}

export function reduceApply(state: ExecutionState, command: StorageCommand): ApplyOutcome {
  if (command.runId !== state.run.runId) {
    throw new LarkxError({
      code: "storage_failure",
      message: "Storage command run id does not match the loaded run.",
      retryable: false,
    });
  }
  const beforeEvents = state.events.length;
  let next = state;
  let appliedStatus = state.run.status;
  let outbox: ApplyOutcome["outbox"] = "unchanged";

  switch (command.type) {
    case "transition-run": {
      const transitioned = transitionRun(state, command);
      next = transitioned.state;
      appliedStatus = transitioned.appliedStatus;
      break;
    }
    case "begin-step":
      next = beginStep(state, command);
      appliedStatus = next.run.status;
      break;
    case "commit-step":
      next = commitStep(state, command);
      appliedStatus = next.run.status;
      break;
    case "resolve-step":
      next = resolveStep(state, command);
      appliedStatus = next.run.status;
      break;
    case "mark-unknown":
      next = markUnknown(state, command);
      appliedStatus = next.run.status;
      break;
    case "reconcile-step":
      next = reconcileStep(state, command);
      appliedStatus = next.run.status;
      break;
    case "insert-outbox": {
      const inserted = insertOutbox(state, command);
      next = inserted.state;
      outbox = inserted.outbox;
      appliedStatus = next.run.status;
      break;
    }
    default: {
      const unknown: never = command.type;
      throw new LarkxError({
        code: "storage_failure",
        message: `Unknown storage command ${String(unknown)}.`,
        retryable: false,
      });
    }
  }

  return {
    state: next,
    events: next.events.slice(beforeEvents),
    appliedStatus,
    outbox,
  };
}

function transitionRun(
  state: ExecutionState,
  command: StorageCommand,
): { state: ExecutionState; appliedStatus: WorkflowStatus } {
  assertFence(state.run, command.fence);
  if (!command.to || !command.event) {
    throw missing("transition-run");
  }
  let to = command.to;
  if (command.honorCancel === true && to === "COMPLETED" && state.run.cancelRequested) {
    to = "CANCELLED";
  }
  assertWorkflowTransition(state.run.status, to);
  const event =
    to === "CANCELLED" && command.event.type !== "WORKFLOW_CANCELLED"
      ? { ...command.event, type: "WORKFLOW_CANCELLED" as const }
      : command.event;
  const run: WorkflowRunRecord = {
    ...state.run,
    status: to,
    updatedAt: command.nowMs,
    outputJson: command.outputJson !== undefined ? command.outputJson : state.run.outputJson,
    errorJson: command.errorJson !== undefined ? command.errorJson : state.run.errorJson,
    blockedReason:
      command.blockedReason !== undefined ? command.blockedReason : state.run.blockedReason,
  };
  return {
    state: appendEvent({ ...state, run }, event),
    appliedStatus: to,
  };
}

function beginStep(state: ExecutionState, command: StorageCommand): ExecutionState {
  assertFence(state.run, command.fence);
  assertMutable(state.run.status);
  const stepKey = required(command.stepKey, "stepKey");
  const stepOrder = required(command.stepOrder, "stepOrder");
  const executionTarget = required(command.executionTarget, "executionTarget");
  const selectedTarget = required(command.selectedTarget, "selectedTarget");
  const effectType = required(command.effectType, "effectType");
  const operationId = required(command.operationId, "operationId");
  const descriptorJson = required(command.descriptorJson, "descriptorJson");
  const attemptId = requiredString(command.attemptId, "attemptId");
  const event = required(command.event, "event");
  const existing = state.steps.find((step) => step.stepKey === stepKey);

  if (!existing) {
    if (stepOrder !== state.steps.length) {
      throw new LarkxError({
        code: "replay_divergence",
        message: `Step "${stepKey}" would be stored at order ${String(stepOrder)}, but the next order is ${String(state.steps.length)}.`,
        retryable: false,
      });
    }
    const step: StepRecord = {
      runId: state.run.runId,
      stepKey,
      stepOrder,
      status: "RUNNING",
      executionTarget,
      selectedTarget,
      effectType,
      attemptCount: 1,
      inputJson: command.inputJson ?? null,
      outputJson: null,
      errorJson: null,
      operationId,
      descriptorJson,
      nextAttemptAt: null,
      createdAt: command.nowMs,
      updatedAt: command.nowMs,
    };
    return appendEvent(
      withStep(state, step, newAttempt(command, step, attemptId, 1), command.nowMs),
      event,
    );
  }

  if (existing.stepOrder !== stepOrder) {
    throw new LarkxError({
      code: "replay_divergence",
      message: `Step "${stepKey}" changed order.`,
      retryable: false,
    });
  }
  if (existing.operationId !== operationId) {
    throw new LarkxError({
      code: "replay_divergence",
      message: `Step "${stepKey}" changed operation id.`,
      retryable: false,
    });
  }
  if (existing.effectType !== effectType || existing.executionTarget !== executionTarget) {
    throw new LarkxError({
      code: "replay_divergence",
      message: `Step "${stepKey}" changed its execution target or effect class.`,
      retryable: false,
    });
  }
  if (existing.status !== "PENDING" && existing.status !== "RETRY_SCHEDULED") {
    throw new LarkxError({
      code: "invalid_state_transition",
      message: `Cannot begin step "${stepKey}" from ${existing.status}.`,
      retryable: false,
    });
  }
  assertStepTransition(existing.status, "RUNNING");
  const attemptNumber = existing.attemptCount + 1;
  const updated: StepRecord = {
    ...existing,
    status: "RUNNING",
    selectedTarget,
    attemptCount: attemptNumber,
    nextAttemptAt: null,
    errorJson: null,
    updatedAt: command.nowMs,
  };
  return appendEvent(
    withStep(state, updated, newAttempt(command, updated, attemptId, attemptNumber), command.nowMs),
    event,
  );
}

function commitStep(state: ExecutionState, command: StorageCommand): ExecutionState {
  assertFence(state.run, command.fence);
  const step = requireRunning(state, required(command.stepKey, "stepKey"));
  const attempt = requireOpenAttempt(state, step, requiredString(command.attemptId, "attemptId"));
  if (command.outputJson === undefined || command.outputJson === null) {
    throw missing("outputJson");
  }
  assertStepTransition(step.status, "COMPLETED");
  const updated: StepRecord = {
    ...step,
    status: "COMPLETED",
    outputJson: command.outputJson,
    errorJson: null,
    nextAttemptAt: null,
    updatedAt: command.nowMs,
  };
  const closed = closeAttempt(state, attempt, "COMPLETED", command.nowMs, null);
  return appendEvent(
    touch({ ...closed, steps: replaceStep(closed.steps, updated) }, command.nowMs),
    required(command.event, "event"),
  );
}

function resolveStep(state: ExecutionState, command: StorageCommand): ExecutionState {
  assertFence(state.run, command.fence);
  const step = requireRunning(state, required(command.stepKey, "stepKey"));
  const attempt = requireOpenAttempt(state, step, requiredString(command.attemptId, "attemptId"));
  const stepTo = required(command.stepTo, "stepTo");
  if (stepTo !== "FAILED" && stepTo !== "RETRY_SCHEDULED" && stepTo !== "CANCELLED") {
    throw new LarkxError({
      code: "invalid_state_transition",
      message: `Step resolution cannot target ${stepTo}.`,
      retryable: false,
    });
  }
  assertStepTransition(step.status, stepTo);
  const attemptStatus = command.attemptStatus ?? (stepTo === "CANCELLED" ? "CANCELLED" : "FAILED");
  const updated: StepRecord = {
    ...step,
    status: stepTo,
    errorJson: command.errorJson ?? step.errorJson,
    nextAttemptAt: stepTo === "RETRY_SCHEDULED" ? (command.nextAttemptAt ?? null) : null,
    updatedAt: command.nowMs,
  };
  let next = touch(
    {
      ...closeAttempt(state, attempt, attemptStatus, command.nowMs, command.errorJson ?? null),
      steps: replaceStep(state.steps, updated),
    },
    command.nowMs,
  );
  next = appendEvent(next, required(command.event, "event"));
  if (command.runTo) {
    assertWorkflowTransition(next.run.status, command.runTo);
    next = appendEvent(
      {
        ...next,
        run: {
          ...next.run,
          status: command.runTo,
          errorJson: command.errorJson !== undefined ? command.errorJson : next.run.errorJson,
          blockedReason:
            command.blockedReason !== undefined ? command.blockedReason : next.run.blockedReason,
          updatedAt: command.nowMs,
        },
      },
      required(command.runEvent, "runEvent"),
    );
  }
  return next;
}

function markUnknown(state: ExecutionState, command: StorageCommand): ExecutionState {
  assertFence(state.run, command.fence);
  const stepKey = required(command.stepKey, "stepKey");
  const step = state.steps.find((item) => item.stepKey === stepKey);
  if (!step) {
    throw notFoundStep(stepKey);
  }
  if (step.status !== "RUNNING" && step.status !== "WAITING_REMOTE") {
    throw new LarkxError({
      code: "invalid_state_transition",
      message: `Cannot mark step "${stepKey}" unknown from ${step.status}.`,
      retryable: false,
    });
  }
  assertStepTransition(step.status, "UNKNOWN_OUTCOME");
  const attempt =
    command.attemptId != null
      ? requireOpenAttempt(state, step, command.attemptId)
      : latestOpenAttempt(state, step.stepKey);
  const updated: StepRecord = {
    ...step,
    status: "UNKNOWN_OUTCOME",
    errorJson: command.errorJson ?? step.errorJson,
    updatedAt: command.nowMs,
  };
  let next = touch(
    {
      ...state,
      steps: replaceStep(state.steps, updated),
      attempts: attempt
        ? closeAttempt(state, attempt, "INTERRUPTED", command.nowMs, command.errorJson ?? null)
            .attempts
        : state.attempts,
    },
    command.nowMs,
  );
  next = appendEvent(next, required(command.stepEvent, "stepEvent"));
  if (next.run.status !== "BLOCKED") {
    assertWorkflowTransition(next.run.status, "BLOCKED");
    next = appendEvent(
      {
        ...next,
        run: {
          ...next.run,
          status: "BLOCKED",
          blockedReason: command.blockedReason ?? command.reason ?? "unknown_outcome",
          updatedAt: command.nowMs,
        },
      },
      required(command.runEvent, "runEvent"),
    );
  }
  return next;
}

function reconcileStep(state: ExecutionState, command: StorageCommand): ExecutionState {
  assertFence(state.run, command.fence);
  const step = state.steps.find((item) => item.stepKey === required(command.stepKey, "stepKey"));
  if (!step) {
    throw notFoundStep(required(command.stepKey, "stepKey"));
  }
  if (step.status !== "UNKNOWN_OUTCOME") {
    throw new LarkxError({
      code: "invalid_state_transition",
      message: `Only UNKNOWN_OUTCOME steps can be reconciled. "${step.stepKey}" is ${step.status}.`,
      retryable: false,
    });
  }
  const resolution = required(command.resolution, "resolution");
  if (resolution === "retry") {
    assertStepTransition(step.status, "RETRY_SCHEDULED");
    let next = touch(
      {
        ...state,
        steps: replaceStep(state.steps, {
          ...step,
          status: "RETRY_SCHEDULED",
          nextAttemptAt: command.nowMs,
          updatedAt: command.nowMs,
        }),
      },
      command.nowMs,
    );
    next = appendEvent(next, required(command.event, "event"));
    if (next.run.status === "BLOCKED") {
      assertWorkflowTransition("BLOCKED", "RUNNING");
      next = appendEvent(
        {
          ...next,
          run: { ...next.run, status: "RUNNING", blockedReason: null, updatedAt: command.nowMs },
        },
        required(command.runEvent, "runEvent"),
      );
    }
    return next;
  }
  if (resolution === "complete") {
    if (command.outputJson === undefined || command.outputJson === null) {
      throw missing("outputJson");
    }
    assertStepTransition(step.status, "COMPLETED");
    let next = touch(
      {
        ...state,
        steps: replaceStep(state.steps, {
          ...step,
          status: "COMPLETED",
          outputJson: command.outputJson,
          errorJson: null,
          updatedAt: command.nowMs,
        }),
      },
      command.nowMs,
    );
    next = appendEvent(next, required(command.event, "event"));
    if (next.run.status === "BLOCKED") {
      next = appendEvent(
        {
          ...next,
          run: { ...next.run, status: "RUNNING", blockedReason: null, updatedAt: command.nowMs },
        },
        required(command.runEvent, "runEvent"),
      );
    }
    return next;
  }
  assertStepTransition(step.status, "FAILED");
  let next = touch(
    {
      ...state,
      steps: replaceStep(state.steps, {
        ...step,
        status: "FAILED",
        errorJson: command.errorJson ?? step.errorJson,
        updatedAt: command.nowMs,
      }),
    },
    command.nowMs,
  );
  next = appendEvent(next, required(command.event, "event"));
  if (!isTerminalWorkflowStatus(next.run.status)) {
    assertWorkflowTransition(next.run.status, "FAILED");
    next = appendEvent(
      {
        ...next,
        run: {
          ...next.run,
          status: "FAILED",
          errorJson: command.errorJson ?? next.run.errorJson,
          blockedReason: null,
          updatedAt: command.nowMs,
        },
      },
      required(command.runEvent, "runEvent"),
    );
  }
  return next;
}

function insertOutbox(
  state: ExecutionState,
  command: StorageCommand,
): { state: ExecutionState; outbox: "inserted" | "deduplicated" } {
  assertFence(state.run, command.fence);
  const message = required(command.message, "message");
  if (message.runId !== state.run.runId) {
    throw new LarkxError({
      code: "storage_failure",
      message: "Outbox message run id does not match the workflow run.",
      retryable: false,
    });
  }
  const existing = state.outbox.find((item) => item.operationId === message.operationId);
  if (existing) {
    if (existing.payloadJson !== message.payloadJson || existing.stepKey !== message.stepKey) {
      throw new LarkxError({
        code: "incompatible_run",
        message: `Operation ${message.operationId} is already queued with a different payload.`,
        retryable: false,
      });
    }
    return { state, outbox: "deduplicated" };
  }
  return {
    state: { ...state, outbox: [...state.outbox, { ...message }] },
    outbox: "inserted",
  };
}

function emptyState(run: WorkflowRunRecord): ExecutionState {
  return { run, steps: [], attempts: [], events: [], outbox: [] };
}

function appendEvent(state: ExecutionState, draft: EventDraft): ExecutionState {
  for (const key of Object.keys(draft.payload)) {
    if (SENSITIVE.has(key)) {
      throw new LarkxError({
        code: "serialization_failure",
        message: `Event payload cannot include "${key}". Persist it on the step record instead.`,
        retryable: false,
      });
    }
  }
  const sequence = state.events.length + 1;
  const last = state.events[state.events.length - 1];
  if (last && last.sequence !== sequence - 1) {
    throw new LarkxError({
      code: "history_integrity",
      message: "Event sequence is not contiguous.",
      retryable: false,
    });
  }
  const event: ExecutionEventRecord = {
    eventId: draft.eventId,
    runId: state.run.runId,
    sequence,
    type: draft.type,
    payload: { ...draft.payload },
    createdAt: draft.createdAt,
  };
  return { ...state, events: [...state.events, event] };
}

function withStep(
  state: ExecutionState,
  step: StepRecord,
  attempt: AttemptRecord,
  nowMs: number,
): ExecutionState {
  return touch(
    {
      ...state,
      steps: replaceStep(state.steps, step),
      attempts: [...state.attempts, attempt],
    },
    nowMs,
  );
}

function newAttempt(
  command: StorageCommand,
  step: StepRecord,
  attemptId: string,
  attemptNumber: number,
): AttemptRecord {
  return {
    attemptId,
    runId: step.runId,
    stepKey: step.stepKey,
    attemptNumber,
    executionTarget: step.selectedTarget,
    status: "STARTED",
    startedAt: command.nowMs,
    completedAt: null,
    errorJson: null,
  };
}

function closeAttempt(
  state: ExecutionState,
  attempt: AttemptRecord,
  status: AttemptRecord["status"],
  nowMs: number,
  errorJson: string | null,
): ExecutionState {
  return {
    ...state,
    attempts: state.attempts.map((item) =>
      item.attemptId === attempt.attemptId
        ? { ...item, status, completedAt: nowMs, errorJson }
        : item,
    ),
  };
}

function replaceStep(steps: StepRecord[], step: StepRecord): StepRecord[] {
  const index = steps.findIndex((item) => item.stepKey === step.stepKey);
  if (index === -1) {
    return [...steps, step].sort((left, right) => left.stepOrder - right.stepOrder);
  }
  const next = steps.slice();
  next[index] = step;
  return next;
}

function touch(state: ExecutionState, nowMs: number): ExecutionState {
  return { ...state, run: { ...state.run, updatedAt: nowMs } };
}

function requireRunning(state: ExecutionState, stepKey: string): StepRecord {
  const step = state.steps.find((item) => item.stepKey === stepKey);
  if (!step) {
    throw notFoundStep(stepKey);
  }
  if (step.status !== "RUNNING") {
    throw new LarkxError({
      code: "invalid_state_transition",
      message: `Step "${stepKey}" is ${step.status}, not RUNNING.`,
      retryable: false,
    });
  }
  return step;
}

function requireOpenAttempt(
  state: ExecutionState,
  step: StepRecord,
  attemptId: string,
): AttemptRecord {
  const attempt = state.attempts.find((item) => item.attemptId === attemptId);
  if (!attempt || attempt.stepKey !== step.stepKey || attempt.status !== "STARTED") {
    throw new LarkxError({
      code: "invalid_state_transition",
      message: `Attempt ${attemptId} is not the open attempt for step "${step.stepKey}".`,
      retryable: false,
    });
  }
  return attempt;
}

function latestOpenAttempt(state: ExecutionState, stepKey: string): AttemptRecord | undefined {
  for (let index = state.attempts.length - 1; index >= 0; index -= 1) {
    const attempt = state.attempts[index];
    if (attempt && attempt.stepKey === stepKey && attempt.status === "STARTED") {
      return attempt;
    }
  }
  return undefined;
}

function assertFence(run: WorkflowRunRecord, fence: OwnershipFence | undefined): void {
  if (!fence || run.ownerId !== fence.ownerId || run.ownershipEpoch !== fence.epoch) {
    throw new LarkxError({
      code: "execution_ownership_conflict",
      message: "The execution owner fence does not match this run.",
      retryable: false,
    });
  }
}

function fenceMatches(run: WorkflowRunRecord, fence: OwnershipFence): boolean {
  return run.ownerId === fence.ownerId && run.ownershipEpoch === fence.epoch;
}

function assertMutable(status: WorkflowStatus): void {
  if (isTerminalWorkflowStatus(status) || status === "BLOCKED") {
    throw new LarkxError({
      code: "invalid_state_transition",
      message: `Cannot execute steps while the workflow is ${status}.`,
      retryable: false,
    });
  }
}

function assertWorkflowTransition(from: WorkflowStatus, to: WorkflowStatus): void {
  if (!canTransitionWorkflow(from, to)) {
    throw new LarkxError({
      code: "invalid_state_transition",
      message: `Cannot transition workflow from ${from} to ${to}.`,
      retryable: false,
    });
  }
}

function assertStepTransition(from: StepStatus, to: StepStatus): void {
  if (!canTransitionStep(from, to)) {
    throw new LarkxError({
      code: "invalid_state_transition",
      message: `Cannot transition step from ${from} to ${to}.`,
      retryable: false,
    });
  }
}

function leaseActive(run: WorkflowRunRecord, nowMs: number): boolean {
  if (run.ownerId === null) {
    return false;
  }
  if (run.leaseExpiresAt === null) {
    return true;
  }
  return run.leaseExpiresAt > nowMs;
}

function expiry(nowMs: number, leaseMs: number): number | null {
  if (leaseMs <= 0) {
    return null;
  }
  return nowMs + leaseMs;
}

function required<T>(value: T | undefined, name: string): T {
  if (value === undefined) {
    throw missing(name);
  }
  return value;
}

function requiredString(value: string | null | undefined, name: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw missing(name);
  }
  return value;
}

function missing(name: string): LarkxError {
  return new LarkxError({
    code: "storage_failure",
    message: `Storage command is missing ${name}.`,
    retryable: false,
  });
}

function notFoundStep(stepKey: string): LarkxError {
  return new LarkxError({
    code: "storage_failure",
    message: `Step "${stepKey}" does not exist.`,
    retryable: false,
  });
}
