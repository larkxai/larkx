/** Execution protocol implemented by this package. Not a storage schema version. */
export const PROTOCOL_VERSION = 1 as const;

export interface ProtocolCompatibility {
  readonly compatible: boolean;
  readonly reason?: string;
}

/**
 * Version 1 is strict: a stored run executes only on an equal protocol version.
 * Compatible evolution has not been defined yet.
 */
export function checkProtocolCompatibility(
  stored: number,
  runtime: number = PROTOCOL_VERSION,
): ProtocolCompatibility {
  if (!Number.isInteger(stored) || stored < 1) {
    return { compatible: false, reason: `Invalid stored protocol version ${String(stored)}.` };
  }
  if (stored !== runtime) {
    return {
      compatible: false,
      reason: `Protocol ${String(stored)} cannot be executed by runtime protocol ${String(runtime)}.`,
    };
  }
  return { compatible: true };
}
