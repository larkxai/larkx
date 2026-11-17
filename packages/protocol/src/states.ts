export const WORKFLOW_STATUSES = [
  "CREATED",
  "RUNNING",
  "WAITING",
  "RECOVERING",
  "COMPLETED",
  "FAILED",
  "CANCELLED",
  "BLOCKED",
] as const;

export type WorkflowStatus = (typeof WORKFLOW_STATUSES)[number];

export const STEP_STATUSES = [
  "PENDING",
  "RUNNING",
  "WAITING_REMOTE",
  "RETRY_SCHEDULED",
  "COMPLETED",
  "FAILED",
  "UNKNOWN_OUTCOME",
  "CANCELLED",
] as const;

export type StepStatus = (typeof STEP_STATUSES)[number];

export const ATTEMPT_STATUSES = [
  "STARTED",
  "COMPLETED",
  "FAILED",
  "INTERRUPTED",
  "CANCELLED",
] as const;

export type AttemptStatus = (typeof ATTEMPT_STATUSES)[number];

export const TERMINAL_WORKFLOW_STATUSES = ["COMPLETED", "FAILED", "CANCELLED"] as const;

export type TerminalWorkflowStatus = (typeof TERMINAL_WORKFLOW_STATUSES)[number];

export function isWorkflowStatus(value: string): value is WorkflowStatus {
  return (WORKFLOW_STATUSES as readonly string[]).includes(value);
}

export function isStepStatus(value: string): value is StepStatus {
  return (STEP_STATUSES as readonly string[]).includes(value);
}

export function isAttemptStatus(value: string): value is AttemptStatus {
  return (ATTEMPT_STATUSES as readonly string[]).includes(value);
}

export function isTerminalWorkflowStatus(status: WorkflowStatus): status is TerminalWorkflowStatus {
  return status === "COMPLETED" || status === "FAILED" || status === "CANCELLED";
}

/** Statuses `recover()` may resume without an explicit reconcile or cancel. */
export function isRecoverableWorkflowStatus(status: WorkflowStatus): boolean {
  return (
    status === "CREATED" || status === "RUNNING" || status === "WAITING" || status === "RECOVERING"
  );
}
