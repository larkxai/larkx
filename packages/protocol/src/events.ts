export const EVENT_TYPES = [
  "WORKFLOW_CREATED",
  "WORKFLOW_STARTED",
  "WORKFLOW_RECOVERED",
  "WORKFLOW_WAITING",
  "WORKFLOW_BLOCKED",
  "STEP_STARTED",
  "STEP_COMPLETED",
  "STEP_FAILED",
  "STEP_RETRY_SCHEDULED",
  "STEP_OUTCOME_UNKNOWN",
  "STEP_RECONCILED",
  "REMOTE_DISPATCH_QUEUED",
  "REMOTE_DISPATCH_ACCEPTED",
  "REMOTE_RESULT_RECEIVED",
  "WORKFLOW_COMPLETED",
  "WORKFLOW_FAILED",
  "WORKFLOW_CANCELLED",
] as const;

export type EventType = (typeof EVENT_TYPES)[number];

export function isEventType(value: string): value is EventType {
  return (EVENT_TYPES as readonly string[]).includes(value);
}

/**
 * Keys that must not appear in the execution event journal.
 * Step inputs and outputs stay on the authoritative step records.
 */
export const SENSITIVE_EVENT_KEYS = [
  "input",
  "output",
  "messages",
  "prompt",
  "toolResult",
  "content",
] as const;
