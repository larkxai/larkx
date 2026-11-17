import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

import { createEngine, type Engine, type EngineOptions, type WorkflowStorage } from "@larkx/core";
import { createSqliteStorage, migrate } from "@larkx/storage-sqlite";

import { ownerProcessIsDead, readOwnerFile, writeOwnerFile } from "./owner-file.js";
import { createNodeSqliteDriver } from "./sqlite-driver.js";

export interface NodeSqliteStorageOptions {
  /** Filesystem path, or `:memory:` for a database that dies with the connection. */
  readonly database: string;
}

export function createNodeSqliteStorage(options: NodeSqliteStorageOptions): WorkflowStorage {
  const filename = options.database === ":memory:" ? ":memory:" : resolve(options.database);
  if (filename !== ":memory:") {
    mkdirSync(dirname(filename), { recursive: true });
  }
  const driver = createNodeSqliteDriver(filename);
  migrate(driver);
  return createSqliteStorage(driver, {
    mayStealFrom(ownerId: string): boolean {
      if (filename === ":memory:") {
        return false;
      }
      const holder = readOwnerFile(filename);
      if (!holder || holder.ownerId !== ownerId) {
        return false;
      }
      return ownerProcessIsDead(holder.pid);
    },
    onClaim(outcome) {
      if (filename === ":memory:" || !outcome.acquired) {
        return;
      }
      writeOwnerFile(filename, outcome.ownerId);
    },
  });
}

export interface NodeEngineOptions
  extends Omit<EngineOptions, "storage">, NodeSqliteStorageOptions {}

export function createNodeEngine(options: NodeEngineOptions): Engine {
  const { database, ...engineOptions } = options;
  const storage = createNodeSqliteStorage({ database });
  return createEngine({
    ...engineOptions,
    storage,
    ownerId: engineOptions.ownerId ?? randomUUID(),
  });
}
