import {
  isErrorCode,
  isJsonObject,
  type DataPolicy,
  type EffectType,
  type ExecutionTarget,
  type JsonObject,
  type SelectedTarget,
  type WorkflowStatus,
} from "@larkxai/protocol";

import { decodeJson } from "./json.js";
import type { AttemptRecord, ExecutionEventRecord, ExecutionState, StepRecord } from "./records.js";

/**
 * Metadata projection of one committed run.
 * Inputs, outputs, error messages, owner ids, and artifact paths are omitted.
 */
export interface JournalDocument {
  readonly run: JournalRun;
  readonly steps: readonly JournalStep[];
  readonly attempts: readonly JournalAttempt[];
  readonly events: readonly ExecutionEventRecord[];
}

export interface JournalRun {
  readonly runId: string;
  readonly workflowName: string;
  readonly workflowVersion: number;
  readonly status: WorkflowStatus;
  readonly dataPolicy: DataPolicy;
  readonly protocolVersion: number;
  readonly createdAt: number;
  readonly updatedAt: number;
  readonly cancelRequested: boolean;
  readonly ownershipEpoch: number;
  readonly ownerPresent: boolean;
  readonly errorCode: string | null;
  readonly errorRetryable: boolean | null;
  readonly blockedReasonCode: string | null;
}

export interface JournalDescriptor {
  readonly effects: EffectType;
  readonly execution: ExecutionTarget;
  readonly timeoutMs: number | null;
}

export interface JournalStep {
  readonly runId: string;
  readonly stepKey: string;
  readonly stepOrder: number;
  readonly status: StepRecord["status"];
  readonly executionTarget: ExecutionTarget;
  readonly selectedTarget: SelectedTarget;
  readonly effectType: EffectType;
  readonly attemptCount: number;
  readonly operationId: string;
  readonly descriptor: JournalDescriptor;
  readonly nextAttemptAt: number | null;
  readonly errorCode: string | null;
  readonly errorRetryable: boolean | null;
  readonly createdAt: number;
  readonly updatedAt: number;
}

export interface JournalAttempt {
  readonly attemptId: string;
  readonly runId: string;
  readonly stepKey: string;
  readonly attemptNumber: number;
  readonly executionTarget: ExecutionTarget;
  readonly status: AttemptRecord["status"];
  readonly startedAt: number;
  readonly completedAt: number | null;
  readonly errorCode: string | null;
  readonly errorRetryable: boolean | null;
}

export function projectJournal(state: ExecutionState): JournalDocument {
  const steps = [...state.steps]
    .sort((left, right) => left.stepOrder - right.stepOrder)
    .map(projectStep);
  const stepKeys = new Set(steps.map((step) => step.stepKey));
  const attempts = state.attempts
    .filter((attempt) => stepKeys.has(attempt.stepKey))
    .filter((attempt) => attempt.attemptNumber >= 1)
    .filter((attempt) => attempt.status === "STARTED" || attempt.completedAt !== null)
    .map(projectAttempt)
    .sort((left, right) => {
      if (left.stepKey === right.stepKey) {
        return left.attemptNumber - right.attemptNumber;
      }
      return left.stepKey < right.stepKey ? -1 : 1;
    });
  return {
    run: projectRun(state),
    steps,
    attempts,
    events: state.events.map((event) => ({
      eventId: event.eventId,
      runId: event.runId,
      sequence: event.sequence,
      type: event.type,
      createdAt: event.createdAt,
      payload: { ...event.payload },
    })),
  };
}

function projectRun(state: ExecutionState): JournalRun {
  const error = errorPair(state.run.errorJson);
  return {
    runId: state.run.runId,
    workflowName: state.run.workflowName,
    workflowVersion: state.run.workflowVersion,
    status: state.run.status,
    dataPolicy: state.run.dataPolicy,
    protocolVersion: state.run.protocolVersion,
    createdAt: state.run.createdAt,
    updatedAt: state.run.updatedAt,
    cancelRequested: state.run.cancelRequested,
    ownershipEpoch: state.run.ownershipEpoch,
    ownerPresent: state.run.ownerId !== null,
    errorCode: error.code,
    errorRetryable: error.retryable,
    blockedReasonCode: blockedCode(state.run.blockedReason),
  };
}

function projectStep(step: StepRecord): JournalStep {
  const error = errorPair(step.errorJson);
  return {
    runId: step.runId,
    stepKey: step.stepKey,
    stepOrder: step.stepOrder,
    status: step.status,
    executionTarget: step.executionTarget,
    selectedTarget: step.selectedTarget,
    effectType: step.effectType,
    attemptCount: step.attemptCount,
    operationId: step.operationId,
    descriptor: projectDescriptor(step),
    nextAttemptAt: step.nextAttemptAt,
    errorCode: error.code,
    errorRetryable: error.retryable,
    createdAt: step.createdAt,
    updatedAt: step.updatedAt,
  };
}

function projectAttempt(attempt: AttemptRecord): JournalAttempt {
  const error = errorPair(attempt.errorJson);
  return {
    attemptId: attempt.attemptId,
    runId: attempt.runId,
    stepKey: attempt.stepKey,
    attemptNumber: attempt.attemptNumber,
    executionTarget: attempt.executionTarget,
    status: attempt.status,
    startedAt: attempt.startedAt,
    completedAt: attempt.status === "STARTED" ? null : attempt.completedAt,
    errorCode: error.code,
    errorRetryable: error.retryable,
  };
}

function projectDescriptor(step: StepRecord): JournalDescriptor {
  let timeoutMs: number | null = null;
  let execution: ExecutionTarget = step.executionTarget;
  try {
    const value = decodeJson(step.descriptorJson);
    if (isJsonObject(value)) {
      const timeout = value["timeoutMs"];
      if (isTimeout(timeout)) {
        timeoutMs = timeout;
      }
      const recorded = value["execution"];
      if (recorded === "local" || recorded === "cloud" || recorded === "hybrid") {
        execution = recorded;
      }
    }
  } catch {
    // The step row still has an effect class and a target. Those are the metadata.
  }
  return {
    effects: step.effectType,
    execution,
    timeoutMs,
  };
}

function errorPair(encoded: string | null): { code: string | null; retryable: boolean | null } {
  const value = readObject(encoded);
  if (!value) {
    return { code: null, retryable: null };
  }
  const code = value["code"];
  const retryable = value["retryable"];
  if (typeof code === "string" && isErrorCode(code) && typeof retryable === "boolean") {
    return { code, retryable };
  }
  return { code: null, retryable: null };
}

function blockedCode(encoded: string | null): string | null {
  const value = readObject(encoded);
  const code = value?.["code"];
  if (typeof code === "string" && isErrorCode(code)) {
    return code;
  }
  return null;
}

function readObject(encoded: string | null): JsonObject | null {
  if (!encoded) {
    return null;
  }
  try {
    const value = decodeJson(encoded);
    return isJsonObject(value) ? value : null;
  } catch {
    return null;
  }
}

function isTimeout(value: unknown): value is number | null {
  return value === null || (typeof value === "number" && Number.isInteger(value) && value >= 0);
}
