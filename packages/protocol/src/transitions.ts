import {
  STEP_STATUSES,
  WORKFLOW_STATUSES,
  type StepStatus,
  type WorkflowStatus,
} from "./states.js";

/**
 * Legal workflow transitions. Terminal states have no exits.
 * CREATED may become BLOCKED when the registered definition cannot start the run.
 * BLOCKED returns to execution only through an explicit reconcile path.
 * WAITING is part of the contract for remote and connectivity waits; the local
 * runtime does not enter it yet.
 */
export const WORKFLOW_TRANSITIONS: Readonly<Record<WorkflowStatus, readonly WorkflowStatus[]>> = {
  CREATED: ["RUNNING", "CANCELLED", "BLOCKED"],
  RUNNING: ["WAITING", "RECOVERING", "COMPLETED", "FAILED", "CANCELLED", "BLOCKED"],
  WAITING: ["RUNNING", "RECOVERING", "CANCELLED", "FAILED", "BLOCKED"],
  RECOVERING: ["RUNNING", "WAITING", "COMPLETED", "FAILED", "CANCELLED", "BLOCKED"],
  COMPLETED: [],
  FAILED: [],
  CANCELLED: [],
  BLOCKED: ["RUNNING", "RECOVERING", "FAILED", "CANCELLED"],
};

/**
 * Legal step transitions.
 * RUNNING does not automatically become FAILED. An interruption is either retried,
 * when the effect policy allows it, or moved to UNKNOWN_OUTCOME.
 */
export const STEP_TRANSITIONS: Readonly<Record<StepStatus, readonly StepStatus[]>> = {
  PENDING: ["RUNNING", "CANCELLED"],
  RUNNING: [
    "COMPLETED",
    "FAILED",
    "WAITING_REMOTE",
    "RETRY_SCHEDULED",
    "UNKNOWN_OUTCOME",
    "CANCELLED",
  ],
  WAITING_REMOTE: ["COMPLETED", "FAILED", "RETRY_SCHEDULED", "UNKNOWN_OUTCOME", "CANCELLED"],
  RETRY_SCHEDULED: ["RUNNING", "CANCELLED", "FAILED"],
  COMPLETED: [],
  FAILED: [],
  UNKNOWN_OUTCOME: ["RETRY_SCHEDULED", "COMPLETED", "FAILED", "CANCELLED"],
  CANCELLED: [],
};

export function canTransitionWorkflow(from: WorkflowStatus, to: WorkflowStatus): boolean {
  return WORKFLOW_TRANSITIONS[from].includes(to);
}

export function canTransitionStep(from: StepStatus, to: StepStatus): boolean {
  return STEP_TRANSITIONS[from].includes(to);
}

export function workflowTransitionEntries(): ReadonlyArray<
  readonly [WorkflowStatus, WorkflowStatus]
> {
  const entries: Array<readonly [WorkflowStatus, WorkflowStatus]> = [];
  for (const from of WORKFLOW_STATUSES) {
    for (const to of WORKFLOW_STATUSES) {
      entries.push([from, to]);
    }
  }
  return entries;
}

export function stepTransitionEntries(): ReadonlyArray<readonly [StepStatus, StepStatus]> {
  const entries: Array<readonly [StepStatus, StepStatus]> = [];
  for (const from of STEP_STATUSES) {
    for (const to of STEP_STATUSES) {
      entries.push([from, to]);
    }
  }
  return entries;
}
