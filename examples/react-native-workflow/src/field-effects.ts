/**
 * Application-data dedupe for the field demo.
 * This is not the LarkX execution store.
 */
export interface EffectStore {
  get(operationId: string): string | undefined | Promise<string | undefined>;
  set(operationId: string, body: string): void | Promise<void>;
}

export interface StoredEffect {
  readonly deduplicated: boolean;
  readonly body: string;
}

const locks = new WeakMap<object, Map<string, Promise<void>>>();

/**
 * Insert the body once for this operation id.
 * Overlapping calls wait, then return the body that was actually stored.
 */
export function commitOnce(
  store: EffectStore,
  operationId: string,
  body: string,
): Promise<StoredEffect> {
  return withLock(store, operationId, async () => {
    const existing = await store.get(operationId);
    if (existing !== undefined) {
      return { deduplicated: true, body: existing };
    }
    await store.set(operationId, body);
    const stored = await store.get(operationId);
    if (stored === undefined) {
      return { deduplicated: false, body };
    }
    return { deduplicated: stored !== body, body: stored };
  });
}

function withLock<T>(store: object, operationId: string, run: () => Promise<T>): Promise<T> {
  let operations = locks.get(store);
  if (operations === undefined) {
    operations = new Map();
    locks.set(store, operations);
  }
  const previous = operations.get(operationId) ?? Promise.resolve();
  const result = previous.then(run, run);
  operations.set(
    operationId,
    result.then(
      () => undefined,
      () => undefined,
    ),
  );
  return result;
}
