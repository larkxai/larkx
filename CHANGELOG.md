# Changelog

This file summarizes user-visible changes. Packages are versioned at 0.1.0 and are not published.

## 0.1.0

First implementation of local durable execution.

- `@larkx/protocol` defines protocol version 1: states, transitions, effects, events, errors, canonical JSON values, and the remote dispatch request shape.
- `@larkx/core` runs local workflows with replay, retries, cancellation, ownership leases, and blocked recovery for unknown non-idempotent outcomes.
- `@larkx/storage-memory` and `@larkx/storage-sqlite` share one reducer. SQLite schema version is 1.
- `@larkx/node` opens a SQLite file with Node's experimental `node:sqlite` and can reclaim a run whose previous process is dead.
- `examples/node-workflow` demonstrates committed steps surviving `SIGKILL`.
- Cloud execution, agents, React Native, and the managed cloud service are not included.
