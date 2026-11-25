# State machines

The tables in `@larkxai/protocol` are the legal transitions. The reducer in `native/core/src/reducer.cpp` is the writer that applies them. The SQLite store calls that reducer inside a transaction. An illegal transition fails and leaves the previous state in place.

Terminal run statuses are `COMPLETED`, `FAILED`, and `CANCELLED`. They have no exits. `BLOCKED` moves through reconcile. `FAILED` is not retried in place.

Protocol version, storage schema version, and the agent definition version are different numbers. A run keeps the agent version it started with.
