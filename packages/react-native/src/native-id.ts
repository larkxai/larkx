const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface NativeUuidModule {
  randomUUID?: () => string;
}

/** Accept a UUID from `expo-crypto`. Reject anything else, including the old time-and-counter fallback. */
export function uuidFrom(module: NativeUuidModule): string {
  if (typeof module.randomUUID !== "function") {
    throw new Error(
      "expo-crypto is required for LarkX Cloud telemetry. Install it in the application.",
    );
  }
  const id = module.randomUUID();
  if (!UUID.test(id)) {
    throw new Error("expo-crypto returned a value that is not a UUID.");
  }
  return id.toLowerCase();
}

export function requireNativeUuid(): () => string {
  let loaded: NativeUuidModule;
  try {
    // Optional peer. Telemetry fails closed when it is not installed.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    loaded = require("expo-crypto") as NativeUuidModule;
  } catch {
    throw new Error(
      "expo-crypto is required for LarkX Cloud telemetry. Install it in the application.",
    );
  }
  return () => uuidFrom(loaded);
}
