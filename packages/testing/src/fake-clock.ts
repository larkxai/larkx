import type { Clock } from "@larkxai/core";
import { LarkxError } from "@larkxai/protocol";

export interface FakeClock extends Clock {
  /** Moves the clock forward and resolves sleeps whose deadline has been reached. */
  advance(ms: number): void;
}

/**
 * Deterministic clock. `sleep` records a waiter instead of advancing time by itself,
 * so retries do not spin. Call `advance` from the test, or use `createAutoClock`
 * when the test does not need to observe intermediate time.
 */
export function createFakeClock(start = 0): FakeClock {
  let now = start;
  const waiters: Array<{
    until: number;
    resolve: () => void;
    reject: (error: unknown) => void;
    signal?: AbortSignal;
  }> = [];
  const clock: FakeClock = {
    now: () => now,
    sleep(ms: number, signal?: AbortSignal): Promise<void> {
      if (signal?.aborted) {
        return Promise.reject(cancelled());
      }
      const until = now + ms;
      return new Promise((resolve, reject) => {
        const waiter = { until, resolve, reject, ...(signal ? { signal } : {}) };
        const onAbort = (): void => {
          const index = waiters.indexOf(waiter);
          if (index >= 0) {
            waiters.splice(index, 1);
          }
          reject(cancelled());
        };
        signal?.addEventListener("abort", onAbort);
        waiters.push({
          until,
          resolve: () => {
            signal?.removeEventListener("abort", onAbort);
            resolve();
          },
          reject,
          ...(signal ? { signal } : {}),
        });
      });
    },
    advance(ms: number): void {
      now += ms;
      for (const waiter of [...waiters]) {
        if (waiter.until <= now) {
          const index = waiters.indexOf(waiter);
          if (index >= 0) {
            waiters.splice(index, 1);
          }
          waiter.resolve();
        }
      }
    },
  };
  return clock;
}

/** Sleep resolves on a later turn after moving the clock forward by the requested delay. */
export function createAutoClock(start = 0): Clock {
  let now = start;
  return {
    now: () => now,
    async sleep(ms: number, signal?: AbortSignal): Promise<void> {
      if (signal?.aborted) {
        throw cancelled();
      }
      now += ms;
      await Promise.resolve();
      if (signal?.aborted) {
        throw cancelled();
      }
    },
  };
}

function cancelled(): LarkxError {
  return new LarkxError({
    code: "cancelled_execution",
    message: "Sleep was cancelled.",
    retryable: false,
  });
}
