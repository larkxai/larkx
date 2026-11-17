export const ERROR_CODES = [
  "invalid_workflow_definition",
  "unknown_workflow_version",
  "incompatible_run",
  "duplicate_step_key",
  "replay_divergence",
  "serialization_failure",
  "storage_failure",
  "execution_ownership_conflict",
  "transient_execution_failure",
  "permanent_execution_failure",
  "network_unavailable",
  "remote_task_failure",
  "unknown_operation_outcome",
  "permission_denied",
  "cancelled_execution",
  "unsupported_capability",
  "invalid_state_transition",
  "history_integrity",
  "protocol_incompatible",
  "step_timeout",
  "run_not_found",
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

export function isErrorCode(value: string): value is ErrorCode {
  return (ERROR_CODES as readonly string[]).includes(value);
}

const NON_RETRYABLE: ReadonlySet<ErrorCode> = new Set([
  "invalid_workflow_definition",
  "unknown_workflow_version",
  "incompatible_run",
  "duplicate_step_key",
  "replay_divergence",
  "serialization_failure",
  "storage_failure",
  "execution_ownership_conflict",
  "permanent_execution_failure",
  "remote_task_failure",
  "unknown_operation_outcome",
  "permission_denied",
  "cancelled_execution",
  "unsupported_capability",
  "invalid_state_transition",
  "history_integrity",
  "protocol_incompatible",
  "run_not_found",
]);

export function isRetryableErrorCode(code: ErrorCode): boolean {
  return !NON_RETRYABLE.has(code);
}

export class LarkxError extends Error {
  readonly code: ErrorCode;
  readonly retryable: boolean;
  readonly details: Readonly<Record<string, string | number | boolean | null>>;

  constructor(input: {
    code: ErrorCode;
    message: string;
    retryable?: boolean;
    cause?: unknown;
    details?: Readonly<Record<string, string | number | boolean | null>>;
  }) {
    super(input.message, input.cause !== undefined ? { cause: input.cause } : undefined);
    this.name = "LarkxError";
    this.code = input.code;
    this.retryable = input.retryable ?? isRetryableErrorCode(input.code);
    this.details = input.details ?? {};
  }
}
