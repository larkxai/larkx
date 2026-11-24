import type {
  ApplyOutcome,
  ArtifactRecord,
  AttemptRecord,
  ClaimOutcome,
  ClaimRequest,
  CreateRunInput,
  ExecutionEventRecord,
  ExecutionState,
  ListRunsQuery,
  OutboxRecord,
  OutboxStatus,
  OwnershipFence,
  StepRecord,
  StorageCommand,
  WorkflowRunRecord,
  WorkflowStorage,
} from "@larkxai/core";
import {
  decodeJson,
  reduceApply,
  reduceClaim,
  reduceCreateRun,
  reduceRelease,
  reduceRenew,
  reduceRequestCancel,
} from "@larkxai/core";
import {
  LarkxError,
  isAttemptStatus,
  isDataPolicy,
  isEffectType,
  isEventType,
  isExecutionTarget,
  isJsonObject,
  isRecoverableWorkflowStatus,
  isSelectedTarget,
  isStepStatus,
  isWorkflowStatus,
  type JsonObject,
} from "@larkxai/protocol";

import type { SqliteDriver, SqliteValue } from "./driver.js";

export interface SqliteStorageOptions {
  readonly mayStealFrom?: (ownerId: string) => boolean;
  readonly onClaim?: (outcome: ClaimOutcome) => void;
  /**
   * When true, another owner cannot take a run just because the lease expired.
   * Mobile storage turns this on. Node leaves it off and uses the pid file.
   */
  readonly exclusiveOwnership?: boolean;
}

export function createSqliteStorage(
  driver: SqliteDriver,
  options: SqliteStorageOptions = {},
): WorkflowStorage {
  return new SqliteStorage(driver, options);
}

class SqliteStorage implements WorkflowStorage {
  readonly kind = "sqlite";
  private closed = false;

  constructor(
    private readonly driver: SqliteDriver,
    private readonly options: SqliteStorageOptions,
  ) {}

  createRun(input: CreateRunInput): Promise<{ state: ExecutionState; created: boolean }> {
    return this.async(() =>
      this.tx(() => {
        const existing = this.loadUnlocked(input.runId);
        const outcome = reduceCreateRun(existing, input);
        if (outcome.created) {
          this.insertRun(outcome.state.run);
          this.insertEvents(outcome.state.events);
        }
        return outcome;
      }),
    );
  }

  loadRun(runId: string): Promise<WorkflowRunRecord | null> {
    return this.async(() => this.tx(() => this.loadUnlocked(runId)?.run ?? null));
  }

  loadExecution(runId: string): Promise<ExecutionState | null> {
    return this.async(() => this.tx(() => this.loadUnlocked(runId)));
  }

  listRuns(query: ListRunsQuery = {}): Promise<WorkflowRunRecord[]> {
    return this.async(() => this.tx(() => filterRuns(this.loadAllRuns(), query)));
  }

  listRecoverableRuns(): Promise<WorkflowRunRecord[]> {
    return this.async(() =>
      this.tx(() => this.loadAllRuns().filter((run) => isRecoverableWorkflowStatus(run.status))),
    );
  }

  claimOwnership(runId: string, input: ClaimRequest): Promise<ClaimOutcome> {
    return this.async(() => {
      const outcome = this.tx(() => {
        const state = this.require(runId);
        const maySteal =
          state.run.ownerId !== null && (this.options.mayStealFrom?.(state.run.ownerId) ?? false);
        const claimed = reduceClaim(state, {
          ...input,
          maySteal,
          ...(this.options.exclusiveOwnership ? { exclusive: true } : {}),
        });
        this.persist(state, claimed.state);
        return claimed;
      });
      if (outcome.acquired) {
        this.options.onClaim?.(outcome);
      }
      return outcome;
    });
  }

  renewOwnership(
    runId: string,
    input: { fence: OwnershipFence; nowMs: number; leaseMs: number },
  ): Promise<boolean> {
    return this.async(() =>
      this.tx(() => {
        const state = this.require(runId);
        const outcome = reduceRenew(state, input);
        this.persist(state, outcome.state);
        return outcome.renewed;
      }),
    );
  }

  releaseOwnership(runId: string, input: { fence: OwnershipFence; nowMs: number }): Promise<void> {
    return this.async(() =>
      this.tx(() => {
        const state = this.loadUnlocked(runId);
        if (!state) {
          return;
        }
        const outcome = reduceRelease(state, input);
        this.persist(state, outcome.state);
      }),
    );
  }

  requestCancel(runId: string, nowMs: number): Promise<void> {
    return this.async(() =>
      this.tx(() => {
        const state = this.require(runId);
        this.persist(state, reduceRequestCancel(state, nowMs));
      }),
    );
  }

  apply(command: StorageCommand): Promise<ApplyOutcome> {
    return this.async(() =>
      this.tx(() => {
        const state = this.require(command.runId);
        const outcome = reduceApply(state, command);
        this.persist(state, outcome.state);
        return outcome;
      }),
    );
  }

  insertArtifact(record: ArtifactRecord): Promise<"inserted" | "deduplicated"> {
    return this.async(() =>
      this.tx(() => {
        const existing = this.getArtifactUnlocked(record.artifactId);
        if (existing) {
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
          return "deduplicated" as const;
        }
        this.driver.run(
          `INSERT INTO artifacts (
            artifact_id, local_uri, remote_reference, content_hash, content_type, size_bytes, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            record.artifactId,
            record.localUri,
            record.remoteReference,
            record.contentHash,
            record.contentType,
            record.sizeBytes,
            record.createdAt,
          ],
        );
        return "inserted" as const;
      }),
    );
  }

  getArtifact(artifactId: string): Promise<ArtifactRecord | null> {
    return this.async(() => this.tx(() => this.getArtifactUnlocked(artifactId)));
  }

  listOutbox(runId: string): Promise<OutboxRecord[]> {
    return this.async(() => this.tx(() => this.loadUnlocked(runId)?.outbox ?? []));
  }

  close(): Promise<void> {
    if (this.closed) {
      return Promise.resolve();
    }
    this.closed = true;
    this.driver.close();
    return Promise.resolve();
  }

  private async<T>(fn: () => T): Promise<T> {
    this.assertOpen();
    return Promise.resolve().then(fn);
  }

  private tx<T>(fn: () => T): T {
    this.assertOpen();
    this.driver.exec("PRAGMA foreign_keys = ON;");
    return this.driver.transaction(fn);
  }

  private assertOpen(): void {
    if (this.closed) {
      throw new LarkxError({
        code: "storage_failure",
        message: "SQLite storage is closed.",
        retryable: false,
      });
    }
  }

  private require(runId: string): ExecutionState {
    const state = this.loadUnlocked(runId);
    if (!state) {
      throw new LarkxError({
        code: "run_not_found",
        message: `Run ${runId} does not exist.`,
        retryable: false,
      });
    }
    return state;
  }

  private loadUnlocked(runId: string): ExecutionState | null {
    const row = this.driver.get<RunRow>("SELECT * FROM workflow_runs WHERE run_id = ?", [runId]);
    if (!row) {
      return null;
    }
    return {
      run: mapRun(row),
      steps: this.driver
        .all<StepRow>("SELECT * FROM workflow_steps WHERE run_id = ? ORDER BY step_order ASC", [
          runId,
        ])
        .map(mapStep),
      attempts: this.driver
        .all<AttemptRow>(
          "SELECT * FROM step_attempts WHERE run_id = ? ORDER BY attempt_number ASC, attempt_id ASC",
          [runId],
        )
        .map(mapAttempt),
      events: this.driver
        .all<EventRow>("SELECT * FROM workflow_events WHERE run_id = ? ORDER BY sequence ASC", [
          runId,
        ])
        .map(mapEvent),
      outbox: this.driver
        .all<OutboxRow>(
          "SELECT * FROM outbox WHERE run_id = ? ORDER BY created_at ASC, message_id ASC",
          [runId],
        )
        .map(mapOutbox),
    };
  }

  private loadAllRuns(): WorkflowRunRecord[] {
    return this.driver
      .all<RunRow>("SELECT * FROM workflow_runs ORDER BY created_at ASC, run_id ASC")
      .map(mapRun);
  }

  private persist(before: ExecutionState, after: ExecutionState): void {
    assertAppendOnly(before.events, after.events);
    this.updateRun(after.run);
    const runId = after.run.runId;
    this.driver.run("DELETE FROM step_attempts WHERE run_id = ?", [runId]);
    this.driver.run("DELETE FROM outbox WHERE run_id = ?", [runId]);
    this.driver.run("DELETE FROM workflow_steps WHERE run_id = ?", [runId]);
    for (const step of after.steps) {
      this.insertStep(step);
    }
    for (const attempt of after.attempts) {
      this.insertAttempt(attempt);
    }
    this.insertEvents(after.events.slice(before.events.length));
    for (const message of after.outbox) {
      this.insertOutbox(message);
    }
  }

  private insertRun(run: WorkflowRunRecord): void {
    this.driver.run(
      `INSERT INTO workflow_runs (
        run_id, workflow_name, workflow_version, input_json, status, output_json, error_json,
        blocked_reason, created_at, updated_at, owner_id, ownership_epoch, lease_expires_at,
        protocol_version, data_policy, cancel_requested
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      runParams(run),
    );
  }

  private updateRun(run: WorkflowRunRecord): void {
    const result = this.driver.run(
      `UPDATE workflow_runs SET
        workflow_name = ?, workflow_version = ?, input_json = ?, status = ?, output_json = ?,
        error_json = ?, blocked_reason = ?, created_at = ?, updated_at = ?, owner_id = ?,
        ownership_epoch = ?, lease_expires_at = ?, protocol_version = ?, data_policy = ?,
        cancel_requested = ?
      WHERE run_id = ?`,
      [
        run.workflowName,
        run.workflowVersion,
        run.inputJson,
        run.status,
        run.outputJson,
        run.errorJson,
        run.blockedReason,
        run.createdAt,
        run.updatedAt,
        run.ownerId,
        run.ownershipEpoch,
        run.leaseExpiresAt,
        run.protocolVersion,
        run.dataPolicy,
        run.cancelRequested ? 1 : 0,
        run.runId,
      ],
    );
    if (result.changes !== 1) {
      throw new LarkxError({
        code: "storage_failure",
        message: `Failed to update run ${run.runId}.`,
        retryable: false,
      });
    }
  }

  private insertStep(step: StepRecord): void {
    this.driver.run(
      `INSERT INTO workflow_steps (
        run_id, step_key, step_order, status, execution_target, selected_target, effect_type,
        attempt_count, input_json, output_json, error_json, operation_id, descriptor_json,
        next_attempt_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        step.runId,
        step.stepKey,
        step.stepOrder,
        step.status,
        step.executionTarget,
        step.selectedTarget,
        step.effectType,
        step.attemptCount,
        step.inputJson,
        step.outputJson,
        step.errorJson,
        step.operationId,
        step.descriptorJson,
        step.nextAttemptAt,
        step.createdAt,
        step.updatedAt,
      ],
    );
  }

  private insertAttempt(attempt: AttemptRecord): void {
    this.driver.run(
      `INSERT INTO step_attempts (
        attempt_id, run_id, step_key, attempt_number, execution_target, status, started_at,
        completed_at, error_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        attempt.attemptId,
        attempt.runId,
        attempt.stepKey,
        attempt.attemptNumber,
        attempt.executionTarget,
        attempt.status,
        attempt.startedAt,
        attempt.completedAt,
        attempt.errorJson,
      ],
    );
  }

  private insertEvents(events: readonly ExecutionEventRecord[]): void {
    for (const event of events) {
      this.driver.run(
        `INSERT INTO workflow_events (event_id, run_id, sequence, event_type, payload_json, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          event.eventId,
          event.runId,
          event.sequence,
          event.type,
          JSON.stringify(event.payload),
          event.createdAt,
        ],
      );
    }
  }

  private insertOutbox(message: OutboxRecord): void {
    this.driver.run(
      `INSERT INTO outbox (
        message_id, run_id, step_key, operation_id, payload_json, status, attempt_count,
        next_attempt_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        message.messageId,
        message.runId,
        message.stepKey,
        message.operationId,
        message.payloadJson,
        message.status,
        message.attemptCount,
        message.nextAttemptAt,
        message.createdAt,
        message.updatedAt,
      ],
    );
  }

  private getArtifactUnlocked(artifactId: string): ArtifactRecord | null {
    const row = this.driver.get<ArtifactRow>("SELECT * FROM artifacts WHERE artifact_id = ?", [
      artifactId,
    ]);
    if (!row) {
      return null;
    }
    return {
      artifactId: row.artifact_id,
      localUri: row.local_uri,
      remoteReference: row.remote_reference,
      contentHash: row.content_hash,
      contentType: row.content_type,
      sizeBytes: row.size_bytes,
      createdAt: row.created_at,
    };
  }
}

function runParams(run: WorkflowRunRecord): SqliteValue[] {
  return [
    run.runId,
    run.workflowName,
    run.workflowVersion,
    run.inputJson,
    run.status,
    run.outputJson,
    run.errorJson,
    run.blockedReason,
    run.createdAt,
    run.updatedAt,
    run.ownerId,
    run.ownershipEpoch,
    run.leaseExpiresAt,
    run.protocolVersion,
    run.dataPolicy,
    run.cancelRequested ? 1 : 0,
  ];
}

function mapRun(row: RunRow): WorkflowRunRecord {
  if (!isWorkflowStatus(row.status) || !isDataPolicy(row.data_policy)) {
    throw corrupt(`Run ${row.run_id} has invalid status or data policy.`);
  }
  return {
    runId: row.run_id,
    workflowName: row.workflow_name,
    workflowVersion: row.workflow_version,
    inputJson: row.input_json,
    status: row.status,
    outputJson: row.output_json,
    errorJson: row.error_json,
    blockedReason: row.blocked_reason,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    ownerId: row.owner_id,
    ownershipEpoch: row.ownership_epoch,
    leaseExpiresAt: row.lease_expires_at,
    protocolVersion: row.protocol_version,
    dataPolicy: row.data_policy,
    cancelRequested: row.cancel_requested !== 0,
  };
}

function mapStep(row: StepRow): StepRecord {
  if (
    !isStepStatus(row.status) ||
    !isExecutionTarget(row.execution_target) ||
    !isSelectedTarget(row.selected_target) ||
    !isEffectType(row.effect_type)
  ) {
    throw corrupt(`Step ${row.step_key} has invalid stored enums.`);
  }
  return {
    runId: row.run_id,
    stepKey: row.step_key,
    stepOrder: row.step_order,
    status: row.status,
    executionTarget: row.execution_target,
    selectedTarget: row.selected_target,
    effectType: row.effect_type,
    attemptCount: row.attempt_count,
    inputJson: row.input_json,
    outputJson: row.output_json,
    errorJson: row.error_json,
    operationId: row.operation_id,
    descriptorJson: row.descriptor_json,
    nextAttemptAt: row.next_attempt_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapAttempt(row: AttemptRow): AttemptRecord {
  if (!isAttemptStatus(row.status) || !isSelectedTarget(row.execution_target)) {
    throw corrupt(`Attempt ${row.attempt_id} has invalid stored enums.`);
  }
  return {
    attemptId: row.attempt_id,
    runId: row.run_id,
    stepKey: row.step_key,
    attemptNumber: row.attempt_number,
    executionTarget: row.execution_target,
    status: row.status,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    errorJson: row.error_json,
  };
}

function mapEvent(row: EventRow): ExecutionEventRecord {
  if (!isEventType(row.event_type)) {
    throw corrupt(`Event ${row.event_id} has an unknown type.`);
  }
  const payload = decodeJson(row.payload_json);
  if (!isJsonObject(payload)) {
    throw corrupt(`Event ${row.event_id} payload is not an object.`);
  }
  return {
    eventId: row.event_id,
    runId: row.run_id,
    sequence: row.sequence,
    type: row.event_type,
    payload: payload as JsonObject,
    createdAt: row.created_at,
  };
}

function mapOutbox(row: OutboxRow): OutboxRecord {
  if (!isOutboxStatus(row.status)) {
    throw corrupt(`Outbox message ${row.message_id} has an invalid status.`);
  }
  return {
    messageId: row.message_id,
    runId: row.run_id,
    stepKey: row.step_key,
    operationId: row.operation_id,
    payloadJson: row.payload_json,
    status: row.status,
    attemptCount: row.attempt_count,
    nextAttemptAt: row.next_attempt_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function isOutboxStatus(value: string): value is OutboxStatus {
  return value === "pending" || value === "accepted" || value === "delivered" || value === "failed";
}

function assertAppendOnly(
  before: readonly ExecutionEventRecord[],
  after: readonly ExecutionEventRecord[],
): void {
  if (after.length < before.length) {
    throw corrupt("Event history was truncated.");
  }
  for (let index = 0; index < before.length; index += 1) {
    const left = before[index];
    const right = after[index];
    if (!left || !right || left.eventId !== right.eventId || left.sequence !== right.sequence) {
      throw corrupt("Event history was rewritten.");
    }
  }
}

function filterRuns(runs: readonly WorkflowRunRecord[], query: ListRunsQuery): WorkflowRunRecord[] {
  const statuses =
    query.status === undefined
      ? undefined
      : Array.isArray(query.status)
        ? query.status
        : [query.status];
  const limit = query.limit ?? 100;
  return runs
    .filter((run) => (statuses ? statuses.includes(run.status) : true))
    .filter((run) =>
      query.workflowName === undefined ? true : run.workflowName === query.workflowName,
    )
    .slice(0, limit);
}

function corrupt(message: string): LarkxError {
  return new LarkxError({ code: "storage_failure", message, retryable: false });
}

interface RunRow {
  run_id: string;
  workflow_name: string;
  workflow_version: number;
  input_json: string;
  status: string;
  output_json: string | null;
  error_json: string | null;
  blocked_reason: string | null;
  created_at: number;
  updated_at: number;
  owner_id: string | null;
  ownership_epoch: number;
  lease_expires_at: number | null;
  protocol_version: number;
  data_policy: string;
  cancel_requested: number;
}

interface StepRow {
  run_id: string;
  step_key: string;
  step_order: number;
  status: string;
  execution_target: string;
  selected_target: string;
  effect_type: string;
  attempt_count: number;
  input_json: string | null;
  output_json: string | null;
  error_json: string | null;
  operation_id: string;
  descriptor_json: string;
  next_attempt_at: number | null;
  created_at: number;
  updated_at: number;
}

interface AttemptRow {
  attempt_id: string;
  run_id: string;
  step_key: string;
  attempt_number: number;
  execution_target: string;
  status: string;
  started_at: number;
  completed_at: number | null;
  error_json: string | null;
}

interface EventRow {
  event_id: string;
  run_id: string;
  sequence: number;
  event_type: string;
  payload_json: string;
  created_at: number;
}

interface OutboxRow {
  message_id: string;
  run_id: string;
  step_key: string;
  operation_id: string;
  payload_json: string;
  status: string;
  attempt_count: number;
  next_attempt_at: number | null;
  created_at: number;
  updated_at: number;
}

interface ArtifactRow {
  artifact_id: string;
  local_uri: string;
  remote_reference: string | null;
  content_hash: string;
  content_type: string;
  size_bytes: number;
  created_at: number;
}
