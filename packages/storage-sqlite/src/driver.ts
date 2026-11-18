export interface SqliteStatementResult {
  readonly changes: number;
}

export type SqliteValue = string | number | null;

/**
 * Synchronous driver surface shared by Node and future React Native adapters.
 * Transactions must run the callback to completion before returning.
 */
export interface SqliteDriver {
  exec(sql: string): void;
  run(sql: string, params?: readonly SqliteValue[]): SqliteStatementResult;
  get<T extends object>(sql: string, params?: readonly SqliteValue[]): T | undefined;
  all<T extends object>(sql: string, params?: readonly SqliteValue[]): T[];
  transaction<T>(fn: () => T): T;
  close(): void;
}
