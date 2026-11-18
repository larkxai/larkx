import type { WorkflowStorage } from "@larkx/core";
import {
  createSqliteStorage,
  migrate,
  type SqliteDriver,
  type SqliteStorageOptions,
} from "@larkx/storage-sqlite";

import { isLiveOwner } from "./ownership.js";

export interface MobileSqliteStorageOptions {
  readonly onClaim?: SqliteStorageOptions["onClaim"];
}

/**
 * SQLite storage with mobile ownership.
 * The schema and reducer are the shared ones in `@larkx/storage-sqlite`.
 * A different owner can take a run only when the current owner is not registered
 * in this JavaScript realm. An expired lease is not enough.
 */
export function createMobileSqliteStorage(
  driver: SqliteDriver,
  options: MobileSqliteStorageOptions = {},
): WorkflowStorage {
  migrate(driver);
  return createSqliteStorage(driver, {
    exclusiveOwnership: true,
    mayStealFrom(ownerId: string): boolean {
      return !isLiveOwner(ownerId);
    },
    ...(options.onClaim ? { onClaim: options.onClaim } : {}),
  });
}
