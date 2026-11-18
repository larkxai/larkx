export interface RetryPolicy {
  readonly maxAttempts: number;
  readonly initialIntervalMs: number;
  readonly maxIntervalMs: number;
  readonly backoff: "fixed" | "exponential";
  readonly factor?: number;
}

export const DEFAULT_RETRY: RetryPolicy = {
  maxAttempts: 3,
  initialIntervalMs: 50,
  maxIntervalMs: 30_000,
  backoff: "exponential",
  factor: 2,
};

export function retryDelayMs(policy: RetryPolicy, failedAttempt: number): number {
  const factor = policy.factor ?? 2;
  const raw =
    policy.backoff === "fixed"
      ? policy.initialIntervalMs
      : policy.initialIntervalMs * factor ** Math.max(0, failedAttempt - 1);
  if (!Number.isFinite(raw)) {
    return policy.maxIntervalMs;
  }
  return Math.min(policy.maxIntervalMs, Math.max(0, Math.floor(raw)));
}

export function assertRetryPolicy(policy: RetryPolicy): void {
  if (!Number.isInteger(policy.maxAttempts) || policy.maxAttempts < 1) {
    throw new Error("Retry maxAttempts must be an integer >= 1.");
  }
  if (policy.initialIntervalMs < 0 || policy.maxIntervalMs < policy.initialIntervalMs) {
    throw new Error("Retry intervals are invalid.");
  }
}
