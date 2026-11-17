import { DatabaseSync } from "node:sqlite";

import type { SqliteDriver, SqliteValue } from "@larkx/storage-sqlite";

/**
 * Node's built-in SQLite driver. The API is still marked experimental by Node 22,
 * which prints a warning on first import. The storage behavior lives in
 * `@larkx/storage-sqlite` so this driver can be replaced without changing it.
 */
export function createNodeSqliteDriver(filename: string): SqliteDriver {
  const db = new DatabaseSync(filename);
  let inTransaction = false;
  return {
    exec(sql: string): void {
      db.exec(sql);
    },
    run(sql: string, params: readonly SqliteValue[] = []) {
      const info = db.prepare(sql).run(...params);
      return { changes: Number(info.changes) };
    },
    get<T extends object>(sql: string, params: readonly SqliteValue[] = []): T | undefined {
      const row = db.prepare(sql).get(...params);
      if (row === undefined) {
        return undefined;
      }
      return { ...(row as T) };
    },
    all<T extends object>(sql: string, params: readonly SqliteValue[] = []): T[] {
      return db
        .prepare(sql)
        .all(...params)
        .map((row) => ({ ...(row as T) }));
    },
    transaction<T>(fn: () => T): T {
      if (inTransaction) {
        return fn();
      }
      inTransaction = true;
      db.exec("BEGIN IMMEDIATE");
      try {
        const result = fn();
        db.exec("COMMIT");
        return result;
      } catch (error) {
        try {
          db.exec("ROLLBACK");
        } catch {
          // The transaction may already have been rolled back by SQLite.
        }
        throw error;
      } finally {
        inTransaction = false;
      }
    },
    close(): void {
      db.close();
    },
  };
}
