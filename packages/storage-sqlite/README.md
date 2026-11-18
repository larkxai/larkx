# @larkx/storage-sqlite

SQLite schema, migrations, and the shared storage behavior for LarkX.

The package does not open a database itself. Callers inject a `SqliteDriver`. `@larkx/node` provides the Node.js driver backed by `node:sqlite`. A React Native driver can implement the same interface later without copying the SQL.

`workflow_runs` and `workflow_steps` are the authoritative state. `workflow_events` is an append-only journal written in the same transaction. The runtime does not treat the journal as the source of replay. Outbox and artifact tables are durable records; the local runtime does not dispatch remote work or copy artifact bytes yet.

This adapter survives process termination when the injected driver stores the database on disk. In-memory SQLite databases do not.

`exclusiveOwnership` refuses to give a run to a different owner only because the lease expired. `@larkx/react-native` turns that on. The Node adapter leaves it off and uses its pid file instead.
