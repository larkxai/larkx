# Storage

The C++ runtime owns SQLite. Schema version is 1, created by `Store::migrate` in `native/core/src/sqlite_store.cpp`. New files are stamped with SQLite `application_id` `0x4C585254`. Any other id is rejected and left unchanged. `workflow_runs` and `workflow_steps` are authoritative. `workflow_events` is an append-only journal written in the same transaction. Replay does not fold events back into state.

`sqlite(path)` in `@larkxai/react-native` passes that file to the core. The private Node host uses the same call in tests. There is no second storage engine and no in-memory adapter.

Opening a file creates it when it is missing. A schema newer than 1 is rejected. The runtime does not delete an existing database. A file written by the removed TypeScript engine is not migrated. Use a new path.

Foreign keys are on. The connection sets a busy timeout and `synchronous=NORMAL`, and requests WAL.
