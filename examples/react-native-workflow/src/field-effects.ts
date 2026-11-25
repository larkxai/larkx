/**
 * Application-data dedupe for the field demo.
 * This is not the LarkX execution store.
 */
export interface EffectStore {
  get(operationId: string): string | undefined;
  set(operationId: string, body: string): void;
}

export interface StoredEffect {
  readonly deduplicated: boolean;
  readonly body: string;
}

/** Return the body already stored for this operation, or store it once. */
export function commitOnce(store: EffectStore, operationId: string, body: string): StoredEffect {
  const existing = store.get(operationId);
  if (existing !== undefined) {
    return { deduplicated: true, body: existing };
  }
  store.set(operationId, body);
  return { deduplicated: false, body };
}
