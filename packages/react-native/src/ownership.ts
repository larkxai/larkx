const LIVE_OWNERS = Symbol.for("larkx.liveOwners");

interface OwnerGlobal {
  [LIVE_OWNERS]?: Set<string>;
}

function owners(): Set<string> {
  const global = globalThis as OwnerGlobal;
  const existing = global[LIVE_OWNERS];
  if (existing) {
    return existing;
  }
  const created = new Set<string>();
  global[LIVE_OWNERS] = created;
  return created;
}

/**
 * Remember an owner for this JavaScript realm.
 * The set lives on `globalThis`, so it survives a Fast Refresh of this module
 * and disappears when the JavaScript runtime is destroyed.
 */
export function registerLiveOwner(ownerId: string): () => void {
  owners().add(ownerId);
  return () => {
    owners().delete(ownerId);
  };
}

/** True when this JavaScript realm still has the owner registered. */
export function isLiveOwner(ownerId: string): boolean {
  return owners().has(ownerId);
}
