import { openDatabaseSync } from "expo-sqlite";

import type { SqliteDriver, SqliteValue } from "@larkx/storage-sqlite";

/**
 * Expo SQLite synchronous driver.
 * Transactions use `BEGIN IMMEDIATE` on this connection. `withTransactionSync`
 * starts a deferred `BEGIN` and does not return the callback result, so the
 * driver issues the transaction statements itself.
 */
export function createExpoSqliteDriver(database: string): SqliteDriver {
  const db = openDatabaseSync(database);
  let inTransaction = false;
  return {
    exec(sql: string): void {
      db.execSync(sql);
    },
    run(sql: string, params: readonly SqliteValue[] = []) {
      const info = db.runSync(sql, [...params]);
      return { changes: Number(info.changes) };
    },
    get<T extends object>(sql: string, params: readonly SqliteValue[] = []): T | undefined {
      const row = db.getFirstSync<T>(sql, [...params]);
      if (row === null || row === undefined) {
        return undefined;
      }
      return { ...row };
    },
    all<T extends object>(sql: string, params: readonly SqliteValue[] = []): T[] {
      return db.getAllSync<T>(sql, [...params]).map((row) => ({ ...row }));
    },
    transaction<T>(fn: () => T): T {
      if (inTransaction) {
        return fn();
      }
      inTransaction = true;
      db.execSync("BEGIN IMMEDIATE");
      try {
        const result = fn();
        db.execSync("COMMIT");
        return result;
      } catch (error) {
        try {
          db.execSync("ROLLBACK");
        } catch {
          // SQLite may already have rolled the transaction back.
        }
        throw error;
      } finally {
        inTransaction = false;
      }
    },
    close(): void {
      db.closeSync();
    },
  };
}
