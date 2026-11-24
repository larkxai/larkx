import type {
  AttemptStatus,
  DataPolicy,
  EffectType,
  EventType,
  ExecutionTarget,
  JsonObject,
  SelectedTarget,
  StepStatus,
  WorkflowStatus,
} from "@larkxai/protocol";

export interface OwnershipFence {
  readonly ownerId: string;
  readonly epoch: number;
}

export interface WorkflowRunRecord {
  runId: string;
  workflowName: string;
  workflowVersion: number;
  inputJson: string;
  status: WorkflowStatus;
  outputJson: string | null;
  errorJson: string | null;
  blockedReason: string | null;
  createdAt: number;
  updatedAt: number;
  ownerId: string | null;
  ownershipEpoch: number;
  leaseExpiresAt: number | null;
  protocolVersion: number;
  dataPolicy: DataPolicy;
  cancelRequested: boolean;
}

export interface StepRecord {
  runId: string;
  stepKey: string;
  stepOrder: number;
  status: StepStatus;
  executionTarget: ExecutionTarget;
  selectedTarget: SelectedTarget;
  effectType: EffectType;
  attemptCount: number;
  inputJson: string | null;
  outputJson: string | null;
  errorJson: string | null;
  operationId: string;
  descriptorJson: string;
  nextAttemptAt: number | null;
  createdAt: number;
  updatedAt: number;
}

export interface AttemptRecord {
  attemptId: string;
  runId: string;
  stepKey: string;
  attemptNumber: number;
  executionTarget: SelectedTarget;
  status: AttemptStatus;
  startedAt: number;
  completedAt: number | null;
  errorJson: string | null;
}

export interface ExecutionEventRecord {
  eventId: string;
  runId: string;
  sequence: number;
  type: EventType;
  payload: JsonObject;
  createdAt: number;
}

export type OutboxStatus = "pending" | "accepted" | "delivered" | "failed";

export interface OutboxRecord {
  messageId: string;
  runId: string;
  stepKey: string;
  operationId: string;
  payloadJson: string;
  status: OutboxStatus;
  attemptCount: number;
  nextAttemptAt: number | null;
  createdAt: number;
  updatedAt: number;
}

export interface ArtifactRecord {
  artifactId: string;
  localUri: string;
  remoteReference: string | null;
  contentHash: string;
  contentType: string;
  sizeBytes: number;
  createdAt: number;
}

/** Authoritative in-memory image of one workflow run. Adapters persist this image. */
export interface ExecutionState {
  run: WorkflowRunRecord;
  steps: StepRecord[];
  attempts: AttemptRecord[];
  events: ExecutionEventRecord[];
  outbox: OutboxRecord[];
}

export interface EventDraft {
  eventId: string;
  type: EventType;
  createdAt: number;
  payload: JsonObject;
}

export interface StoredError {
  code: string;
  message: string;
  retryable: boolean;
}
