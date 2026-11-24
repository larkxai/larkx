import { LarkxError } from "@larkxai/protocol";

type TimerHost = typeof globalThis & {
  setTimeout: (callback: () => void, ms: number) => unknown;
  clearTimeout: (handle: unknown) => void;
};

export interface Clock {
  now(): number;
  sleep(ms: number, signal?: AbortSignal): Promise<void>;
}

export function createSystemClock(): Clock {
  return {
    now: () => Date.now(),
    sleep(ms: number, signal?: AbortSignal): Promise<void> {
      if (signal?.aborted) {
        return Promise.reject(cancelledSleep());
      }
      const host = globalThis as TimerHost;
      return new Promise((resolve, reject) => {
        const handle = host.setTimeout(() => {
          signal?.removeEventListener("abort", onAbort);
          resolve();
        }, ms);
        const onAbort = (): void => {
          host.clearTimeout(handle);
          reject(cancelledSleep());
        };
        signal?.addEventListener("abort", onAbort);
      });
    },
  };
}

function cancelledSleep(): LarkxError {
  return new LarkxError({
    code: "cancelled_execution",
    message: "Sleep was cancelled.",
    retryable: false,
  });
}
