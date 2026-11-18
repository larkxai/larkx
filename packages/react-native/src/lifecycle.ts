export interface Recoverable {
  recover(): Promise<unknown>;
}

export interface AppStateSource {
  readonly currentState: string | null | undefined;
  addEventListener(type: "change", listener: (state: string) => void): { remove(): void };
}

export interface NetworkSource {
  getNetworkState(): Promise<{ isConnected?: boolean | null }>;
}

export interface MobileLifecycle {
  /** Latest connectivity observation. `null` means it has not been read. */
  online: boolean | null;
  /** Stop listening. Does not release workflow ownership. */
  remove(): void;
}

export interface BindMobileLifecycleOptions {
  readonly appState: AppStateSource;
  readonly network?: NetworkSource;
  readonly onConnectivity?: (online: boolean | null) => void;
}

/**
 * Recover when the application becomes active again.
 * Background and inactive states leave the current owner in place.
 * An offline observation does not fail local work. A later online observation
 * calls `recover()` again, which is a no-op for runs this process already owns.
 */
export function bindMobileLifecycle(
  engine: Recoverable,
  options: BindMobileLifecycleOptions,
): MobileLifecycle {
  const lifecycle: MobileLifecycle = {
    online: null,
    remove() {
      subscription.remove();
    },
  };
  const subscription = options.appState.addEventListener("change", (state) => {
    if (state === "active") {
      void refresh(engine, options, lifecycle);
    }
  });
  if (options.appState.currentState === "active") {
    void refresh(engine, options, lifecycle);
  }
  return lifecycle;
}

async function refresh(
  engine: Recoverable,
  options: BindMobileLifecycleOptions,
  lifecycle: MobileLifecycle,
): Promise<void> {
  if (options.network) {
    try {
      const state = await options.network.getNetworkState();
      lifecycle.online = state.isConnected ?? null;
    } catch {
      lifecycle.online = null;
    }
    options.onConnectivity?.(lifecycle.online);
  }
  try {
    await engine.recover();
  } catch {
    // The engine can be closed while a foreground event is still in flight.
  }
}
