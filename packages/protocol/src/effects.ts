export const EFFECT_TYPES = ["pure", "idempotent", "non-idempotent"] as const;

export type EffectType = (typeof EFFECT_TYPES)[number];

export const EXECUTION_TARGETS = ["local", "cloud", "hybrid"] as const;

export type ExecutionTarget = (typeof EXECUTION_TARGETS)[number];

export const SELECTED_TARGETS = ["local", "cloud"] as const;

export type SelectedTarget = (typeof SELECTED_TARGETS)[number];

export const DATA_POLICIES = ["device-only", "cloud-allowed"] as const;

export type DataPolicy = (typeof DATA_POLICIES)[number];

export function isEffectType(value: string): value is EffectType {
  return (EFFECT_TYPES as readonly string[]).includes(value);
}

export function isExecutionTarget(value: string): value is ExecutionTarget {
  return (EXECUTION_TARGETS as readonly string[]).includes(value);
}

export function isSelectedTarget(value: string): value is SelectedTarget {
  return (SELECTED_TARGETS as readonly string[]).includes(value);
}

export function isDataPolicy(value: string): value is DataPolicy {
  return (DATA_POLICIES as readonly string[]).includes(value);
}

/** The stricter policy wins. Device-only forbids remote transfer. */
export function strictestDataPolicy(left: DataPolicy, right: DataPolicy): DataPolicy {
  if (left === "device-only" || right === "device-only") {
    return "device-only";
  }
  return "cloud-allowed";
}
