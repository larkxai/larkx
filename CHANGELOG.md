# Changelog

This file summarizes user-visible changes. Public packages share one version and publish to npm from `main`.

## Unreleased

- The TypeScript execution engine is removed. `@larkxai/node` and `@larkxai/react-native` drive the shared C++ runtime. Import `createRuntime`, `defineTool`, and `sqlite` from the package root.
- `@larkxai/core`, `@larkxai/agent`, `@larkxai/storage-memory`, `@larkxai/storage-sqlite`, and `@larkxai/testing` are no longer published from this repository. Existing npm versions stay published.
- There is no migration from a TypeScript-engine database. Open a new SQLite file. The runtime does not delete an existing database.
- `@larkxai/telemetry` keeps the metadata batch contract. The C++ runtime does not export it yet.

## 0.1.0

First implementation of local durable execution.

- `@larkxai/protocol` defines protocol version 1: states, transitions, effects, events, errors, canonical JSON values, and the remote dispatch request shape.
- `@larkxai/core` runs local workflows with replay, retries, cancellation, ownership leases, and blocked recovery for unknown non-idempotent outcomes.
- `@larkxai/storage-memory` and `@larkxai/storage-sqlite` share one reducer. SQLite schema version is 1.
- `@larkxai/node` opens a SQLite file with Node's experimental `node:sqlite` and can reclaim a run whose previous process is dead.
- `examples/node-workflow` demonstrates committed steps surviving `SIGKILL`.
- Cloud execution, agents, React Native, and the managed cloud service are not included.
