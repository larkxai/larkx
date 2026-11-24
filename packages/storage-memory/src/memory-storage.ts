import {
  reduceApply,
  reduceClaim,
  reduceCreateRun,
  reduceRelease,
  reduceRenew,
  reduceRequestCancel,
  type ApplyOutcome,
  type ArtifactRecord,
  type ClaimOutcome,
  type ClaimRequest,
  type CreateRunInput,
  type ExecutionState,
  type ListRunsQuery,
  type OutboxRecord,
  type OwnershipFence,
  type StorageCommand,
  type WorkflowRunRecord,
  type WorkflowStorage,
} from "@larkxai/core";
import { LarkxError, isRecoverableWorkflowStatus, isWorkflowStatus } from "@larkxai/protocol";

export interface MemoryStorageOptions {
  /** Test hook. Production callers leave this unset. A true result may steal a live lease. */
  readonly mayStealFrom?: (ownerId: string) => boolean;
  /**
   * When true, another owner cannot take a run just because the lease expired.
   * `mayStealFrom` remains the explicit permission to replace an owner.
   */
  readonly exclusiveOwnership?: boolean;
}

/**
 * Process-local storage. Closing or discarding this object drops every run.
 * It is the reference adapter for tests and development, not for crash recovery.
 */
export function createMemoryStorage(options: MemoryStorageOptions = {}): WorkflowStorage {
  return new MemoryStorage(options);
}

class MemoryStorage implements WorkflowStorage {
  readonly kind = "memory";
  private readonly runs = new Map<string, ExecutionState>();
  private readonly artifacts = new Map<string, ArtifactRecord>();
  private queue: Promise<unknown> = Promise.resolve();
  private closed = false;

  constructor(private readonly options: MemoryStorageOptions) {}

  createRun(input: CreateRunInput): Promise<{ state: ExecutionState; created: boolean }> {
    return this.exclusive(() => {
      const existing = this.runs.get(input.runId) ?? null;
      const outcome = reduceCreateRun(existing, input);
      this.runs.set(input.runId, outcome.state);
      return outcome;
    });
  }

  loadRun(runId: string): Promise<WorkflowRunRecord | null> {
    return this.exclusive(() => this.runs.get(runId)?.run ?? null);
  }

  loadExecution(runId: string): Promise<ExecutionState | null> {
    return this.exclusive(() => this.runs.get(runId) ?? null);
  }

  listRuns(query: ListRunsQuery = {}): Promise<WorkflowRunRecord[]> {
    return this.exclusive(() =>
      filterRuns(
        [...this.runs.values()].map((state) => state.run),
        query,
      ),
    );
  }

  listRecoverableRuns(): Promise<WorkflowRunRecord[]> {
    return this.exclusive(() =>
      [...this.runs.values()]
        .map((state) => state.run)
        .filter((run) => isRecoverableWorkflowStatus(run.status))
        .sort(compareRuns),
    );
  }

  claimOwnership(runId: string, input: ClaimRequest): Promise<ClaimOutcome> {
    return this.exclusive(() => {
      const state = this.require(runId);
      const maySteal =
        state.run.ownerId !== null && (this.options.mayStealFrom?.(state.run.ownerId) ?? false);
      const outcome = reduceClaim(state, {
        ...input,
        maySteal,
        ...(this.options.exclusiveOwnership ? { exclusive: true } : {}),
      });
      this.runs.set(runId, outcome.state);
      return outcome;
    });
  }

  renewOwnership(
    runId: string,
    input: { fence: OwnershipFence; nowMs: number; leaseMs: number },
  ): Promise<boolean> {
    return this.exclusive(() => {
      const state = this.require(runId);
      const outcome = reduceRenew(state, input);
      this.runs.set(runId, outcome.state);
      return outcome.renewed;
    });
  }

  releaseOwnership(runId: string, input: { fence: OwnershipFence; nowMs: number }): Promise<void> {
    return this.exclusive(() => {
      const state = this.runs.get(runId);
      if (!state) {
        return;
      }
      const outcome = reduceRelease(state, input);
      this.runs.set(runId, outcome.state);
    });
  }

  requestCancel(runId: string, nowMs: number): Promise<void> {
    return this.exclusive(() => {
      const state = this.require(runId);
      this.runs.set(runId, reduceRequestCancel(state, nowMs));
    });
  }

  apply(command: StorageCommand): Promise<ApplyOutcome> {
    return this.exclusive(() => {
      const state = this.require(command.runId);
      const outcome = reduceApply(state, command);
      this.runs.set(command.runId, outcome.state);
      return outcome;
    });
  }

  insertArtifact(record: ArtifactRecord): Promise<"inserted" | "deduplicated"> {
    return this.exclusive(() => {
      const existing = this.artifacts.get(record.artifactId);
      if (existing) {
        assertSameArtifact(existing, record);
        return "deduplicated";
      }
      this.artifacts.set(record.artifactId, { ...record });
      return "inserted";
    });
  }

  getArtifact(artifactId: string): Promise<ArtifactRecord | null> {
    return this.exclusive(() => this.artifacts.get(artifactId) ?? null);
  }

  listOutbox(runId: string): Promise<OutboxRecord[]> {
    return this.exclusive(() => this.runs.get(runId)?.outbox.map((item) => ({ ...item })) ?? []);
  }

  close(): Promise<void> {
    return this.exclusive(() => {
      this.closed = true;
      this.runs.clear();
      this.artifacts.clear();
    }, true);
  }

  private require(runId: string): ExecutionState {
    const state = this.runs.get(runId);
    if (!state) {
      throw new LarkxError({
        code: "run_not_found",
        message: `Run ${runId} does not exist.`,
        retryable: false,
      });
    }
    return state;
  }

  private exclusive<T>(fn: () => T, allowClosed = false): Promise<T> {
    if (this.closed && !allowClosed) {
      return Promise.reject(
        new LarkxError({
          code: "storage_failure",
          message: "Memory storage is closed.",
          retryable: false,
        }),
      );
    }
    const run = this.queue.then(() => fn());
    this.queue = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }
}

function filterRuns(runs: WorkflowRunRecord[], query: ListRunsQuery): WorkflowRunRecord[] {
  const statuses =
    query.status === undefined
      ? undefined
      : Array.isArray(query.status)
        ? query.status
        : [query.status];
  if (statuses?.some((status) => !isWorkflowStatus(status))) {
    throw new LarkxError({
      code: "storage_failure",
      message: "Unknown workflow status in list query.",
      retryable: false,
    });
  }
  const limit = query.limit ?? 100;
  return runs
    .filter((run) => (statuses ? statuses.includes(run.status) : true))
    .filter((run) => (query.workflowName ? run.workflowName === query.workflowName : true))
    .sort(compareRuns)
    .slice(0, limit);
}

function compareRuns(left: WorkflowRunRecord, right: WorkflowRunRecord): number {
  return left.createdAt - right.createdAt || left.runId.localeCompare(right.runId);
}

function assertSameArtifact(existing: ArtifactRecord, record: ArtifactRecord): void {
  if (
    existing.localUri !== record.localUri ||
    existing.contentHash !== record.contentHash ||
    existing.contentType !== record.contentType ||
    existing.sizeBytes !== record.sizeBytes
  ) {
    throw new LarkxError({
      code: "storage_failure",
      message: `Artifact ${record.artifactId} already exists with different metadata.`,
      retryable: false,
    });
  }
}
