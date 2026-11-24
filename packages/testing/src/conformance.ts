import type { StorageCommand, WorkflowStorage } from "@larkxai/core";
import { encodeJson } from "@larkxai/core";
import { LarkxError, PROTOCOL_VERSION } from "@larkxai/protocol";

export interface StorageConformanceCase {
  readonly name: string;
  run(storage: WorkflowStorage): Promise<void>;
}

export function storageConformanceCases(): readonly StorageConformanceCase[] {
  return [
    { name: "creates and reloads a run with its created event", run: createsRun },
    { name: "does not reset an existing run id", run: duplicateCreate },
    { name: "rejects a stale owner commit and keeps the winner", run: staleOwner },
    { name: "steals an expired lease and fences the previous epoch", run: expiredLease },
    { name: "commits a step, attempt, and event atomically", run: atomicStep },
    { name: "rolls back an illegal transition", run: illegalTransition },
    { name: "deduplicates an outbox operation id", run: outboxDedupe },
    { name: "stores artifact metadata", run: artifacts },
    { name: "serializes concurrent claims", run: concurrentClaims },
  ];
}

async function createsRun(storage: WorkflowStorage): Promise<void> {
  const created = await storage.createRun(runInput("run-1"));
  assert(created.created, "expected a new run");
  const loaded = await storage.loadExecution("run-1");
  assert(loaded?.run.status === "CREATED", "run should reload");
  assert(
    loaded?.events.length === 1 && loaded.events[0]?.type === "WORKFLOW_CREATED",
    "created event",
  );
  assert(
    !JSON.stringify(loaded?.events[0]?.payload).includes("secret-input"),
    "event redacts input",
  );
}

async function duplicateCreate(storage: WorkflowStorage): Promise<void> {
  await storage.createRun(runInput("run-dup"));
  const again = await storage.createRun({
    ...runInput("run-dup"),
    inputJson: encodeJson({ changed: true }),
  });
  assert(!again.created, "duplicate create");
  const loaded = await storage.loadRun("run-dup");
  assert(loaded?.inputJson === encodeJson({ text: "secret-input" }), "original input remains");
}

async function staleOwner(storage: WorkflowStorage): Promise<void> {
  await storage.createRun(runInput("run-fence"));
  const first = await storage.claimOwnership("run-fence", {
    ownerId: "owner-a",
    nowMs: 1_000,
    leaseMs: 0,
  });
  const second = await storage.claimOwnership("run-fence", {
    ownerId: "owner-b",
    nowMs: 1_000,
    leaseMs: 0,
  });
  assert(first.acquired, "first claim");
  assert(!second.acquired && second.reason === "owned_by_other", "second claim blocked");
  await expectRejection(
    storage.apply(begin("run-fence", { ownerId: "owner-b", epoch: second.epoch }, "a")),
    "execution_ownership_conflict",
  );
  const committed = await storage.apply(
    begin("run-fence", { ownerId: "owner-a", epoch: first.epoch }, "a"),
  );
  assert(committed.state.steps[0]?.status === "RUNNING", "owner can begin");
}

async function expiredLease(storage: WorkflowStorage): Promise<void> {
  await storage.createRun(runInput("run-lease"));
  const first = await storage.claimOwnership("run-lease", {
    ownerId: "owner-a",
    nowMs: 0,
    leaseMs: 100,
  });
  const second = await storage.claimOwnership("run-lease", {
    ownerId: "owner-b",
    nowMs: 150,
    leaseMs: 100,
  });
  assert(second.acquired && second.epoch === first.epoch + 1, "expired lease can be taken");
  await expectRejection(
    storage.apply(begin("run-lease", { ownerId: "owner-a", epoch: first.epoch }, "a")),
    "execution_ownership_conflict",
  );
}

async function atomicStep(storage: WorkflowStorage): Promise<void> {
  await storage.createRun(runInput("run-step"));
  const claim = await storage.claimOwnership("run-step", {
    ownerId: "owner-a",
    nowMs: 5,
    leaseMs: 0,
  });
  const fence = { ownerId: "owner-a", epoch: claim.epoch };
  await storage.apply({
    type: "transition-run",
    runId: "run-step",
    fence,
    nowMs: 6,
    to: "RUNNING",
    event: { eventId: "ev-start", type: "WORKFLOW_STARTED", createdAt: 6, payload: {} },
  });
  const begun = await storage.apply(begin("run-step", fence, "detect"));
  const committed = await storage.apply({
    type: "commit-step",
    runId: "run-step",
    fence,
    nowMs: 8,
    stepKey: "detect",
    attemptId: "attempt-detect",
    outputJson: encodeJson({ objects: 2 }),
    event: {
      eventId: "ev-done",
      type: "STEP_COMPLETED",
      createdAt: 8,
      payload: { stepKey: "detect" },
    },
  });
  assert(committed.state.steps[0]?.status === "COMPLETED", "step completed");
  assert(committed.state.attempts[0]?.status === "COMPLETED", "attempt completed");
  assert(
    committed.state.events.some((event) => event.type === "STEP_COMPLETED"),
    "event committed",
  );
  assert(
    begun.state.events.some((event) => event.type === "STEP_STARTED"),
    "start event",
  );
  const history = JSON.stringify(committed.state.events);
  assert(!history.includes("objects"), "step output stays off the event journal");
}

async function illegalTransition(storage: WorkflowStorage): Promise<void> {
  await storage.createRun(runInput("run-illegal"));
  const claim = await storage.claimOwnership("run-illegal", {
    ownerId: "owner-a",
    nowMs: 1,
    leaseMs: 0,
  });
  await expectRejection(
    storage.apply({
      type: "transition-run",
      runId: "run-illegal",
      fence: { ownerId: "owner-a", epoch: claim.epoch },
      nowMs: 2,
      to: "COMPLETED",
      outputJson: encodeJson({ ok: true }),
      event: { eventId: "ev-bad", type: "WORKFLOW_COMPLETED", createdAt: 2, payload: {} },
    }),
    "invalid_state_transition",
  );
  const loaded = await storage.loadRun("run-illegal");
  assert(loaded?.status === "CREATED", "illegal transition rolled back");
  assert(loaded?.outputJson === null, "output was not stored");
}

async function outboxDedupe(storage: WorkflowStorage): Promise<void> {
  await storage.createRun(runInput("run-outbox"));
  const claim = await storage.claimOwnership("run-outbox", {
    ownerId: "owner-a",
    nowMs: 1,
    leaseMs: 0,
  });
  const fence = { ownerId: "owner-a", epoch: claim.epoch };
  const message = {
    messageId: "msg-1",
    runId: "run-outbox",
    stepKey: "dispatch",
    operationId: "op-1",
    payloadJson: encodeJson({ handler: "generate-plan-v1" }),
    status: "pending" as const,
    attemptCount: 0,
    nextAttemptAt: null,
    createdAt: 2,
    updatedAt: 2,
  };
  const first = await storage.apply({
    type: "insert-outbox",
    runId: "run-outbox",
    fence,
    nowMs: 2,
    message,
  });
  const second = await storage.apply({
    type: "insert-outbox",
    runId: "run-outbox",
    fence,
    nowMs: 3,
    message: { ...message, messageId: "msg-2" },
  });
  assert(first.outbox === "inserted", "first outbox insert");
  assert(second.outbox === "deduplicated", "duplicate operation");
  const listed = await storage.listOutbox("run-outbox");
  assert(listed.length === 1 && listed[0]?.operationId === "op-1", "one outbox row");
}

async function artifacts(storage: WorkflowStorage): Promise<void> {
  const record = {
    artifactId: "art-1",
    localUri: "file:///durable/photo.jpg",
    remoteReference: null,
    contentHash: "abc",
    contentType: "image/jpeg",
    sizeBytes: 12,
    createdAt: 4,
  };
  assert((await storage.insertArtifact(record)) === "inserted", "artifact insert");
  assert((await storage.insertArtifact(record)) === "deduplicated", "artifact dedupe");
  const loaded = await storage.getArtifact("art-1");
  assert(loaded?.contentHash === "abc", "artifact reload");
}

async function concurrentClaims(storage: WorkflowStorage): Promise<void> {
  await storage.createRun(runInput("run-race"));
  const [left, right] = await Promise.all([
    storage.claimOwnership("run-race", { ownerId: "owner-a", nowMs: 10, leaseMs: 0 }),
    storage.claimOwnership("run-race", { ownerId: "owner-b", nowMs: 10, leaseMs: 0 }),
  ]);
  const winners = [left, right].filter((result) => result.acquired);
  assert(winners.length === 1, "one concurrent owner");
}

function runInput(runId: string) {
  return {
    runId,
    workflowName: "room-analysis",
    workflowVersion: 1,
    inputJson: encodeJson({ text: "secret-input" }),
    nowMs: 1,
    eventId: `created-${runId}`,
    protocolVersion: PROTOCOL_VERSION,
    dataPolicy: "device-only" as const,
  };
}

function begin(
  runId: string,
  fence: { ownerId: string; epoch: number },
  stepKey: string,
): StorageCommand {
  return {
    type: "begin-step",
    runId,
    fence,
    nowMs: 7,
    stepKey,
    stepOrder: 0,
    executionTarget: "local",
    selectedTarget: "local",
    effectType: "pure",
    operationId: `op-${stepKey}`,
    descriptorJson: encodeJson({ execution: "local", effects: "pure" }),
    inputJson: null,
    attemptId: `attempt-${stepKey}`,
    event: {
      eventId: `start-${stepKey}`,
      type: "STEP_STARTED",
      createdAt: 7,
      payload: { stepKey },
    },
  };
}

async function expectRejection(promise: Promise<unknown>, code: string): Promise<void> {
  try {
    await promise;
  } catch (error) {
    assert(
      error instanceof LarkxError && error.code === code,
      `expected ${code}, got ${String(error)}`,
    );
    return;
  }
  throw new Error(`Expected ${code}`);
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}
