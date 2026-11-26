import type {
  DataPolicy,
  EffectType,
  EventType,
  ExecutionTarget,
  JsonObject,
  SelectedTarget,
  WorkflowStatus,
} from "@larkxai/protocol";

/**
 * Metadata projection of one committed run.
 * The host builds this document from the native journal. Inputs, outputs, prompts,
 * and owner ids do not belong in it.
 */
export interface JournalDocument {
  readonly run: JournalRun;
  readonly steps: readonly JournalStep[];
  readonly attempts: readonly JournalAttempt[];
  readonly events: readonly JournalEvent[];
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

export interface JournalStep {
  readonly runId: string;
  readonly stepKey: string;
  readonly stepOrder: number;
  readonly status: string;
  readonly executionTarget: ExecutionTarget;
  readonly selectedTarget: SelectedTarget;
  readonly effectType: EffectType;
  readonly attemptCount: number;
  readonly operationId: string;
  readonly descriptor: {
    readonly effects: EffectType;
    readonly execution: ExecutionTarget;
    readonly timeoutMs: number | null;
  };
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
  readonly status: string;
  readonly startedAt: number;
  readonly completedAt: number | null;
  readonly errorCode: string | null;
  readonly errorRetryable: boolean | null;
}

export interface JournalEvent {
  readonly eventId: string;
  readonly runId: string;
  readonly sequence: number;
  readonly type: EventType;
  readonly createdAt: number;
  readonly payload: JsonObject;
}
