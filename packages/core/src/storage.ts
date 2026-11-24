import type { WorkflowStatus } from "@larkxai/protocol";

import type { ApplyOutcome, ClaimOutcome, CreateRunInput, StorageCommand } from "./reduce.js";
import type {
  ArtifactRecord,
  ExecutionState,
  OutboxRecord,
  OwnershipFence,
  WorkflowRunRecord,
} from "./records.js";

export interface ClaimRequest {
  readonly ownerId: string;
  readonly nowMs: number;
  readonly leaseMs: number;
}

export interface ListRunsQuery {
  readonly status?: WorkflowStatus | readonly WorkflowStatus[];
  readonly workflowName?: string;
  readonly limit?: number;
}

export interface WorkflowStorage {
  readonly kind: string;
  createRun(input: CreateRunInput): Promise<{ state: ExecutionState; created: boolean }>;
  loadRun(runId: string): Promise<WorkflowRunRecord | null>;
  loadExecution(runId: string): Promise<ExecutionState | null>;
  listRuns(query?: ListRunsQuery): Promise<WorkflowRunRecord[]>;
  listRecoverableRuns(): Promise<WorkflowRunRecord[]>;
  claimOwnership(runId: string, input: ClaimRequest): Promise<ClaimOutcome>;
  renewOwnership(
    runId: string,
    input: { fence: OwnershipFence; nowMs: number; leaseMs: number },
  ): Promise<boolean>;
  releaseOwnership(runId: string, input: { fence: OwnershipFence; nowMs: number }): Promise<void>;
  requestCancel(runId: string, nowMs: number): Promise<void>;
  apply(command: StorageCommand): Promise<ApplyOutcome>;
  insertArtifact(record: ArtifactRecord): Promise<"inserted" | "deduplicated">;
  getArtifact(artifactId: string): Promise<ArtifactRecord | null>;
  listOutbox(runId: string): Promise<OutboxRecord[]>;
  close(): Promise<void>;
}

export type { ApplyOutcome, ClaimOutcome, CreateRunInput, StorageCommand };
