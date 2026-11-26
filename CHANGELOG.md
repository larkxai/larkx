# Changelog

This file summarizes user-visible changes. `@larkxai/react-native` publishes to npm from `main`.

## Unreleased

- `@larkxai/react-native` is the only package published from this repository. It bundles the host driver. `@larkxai/node` remains in the repository for tests and development and is not published. Versions of `@larkxai/node` already on npm stay there. `@larkxai/host`, `@larkxai/protocol`, `@larkxai/cactus`, and `@larkxai/telemetry` stay private.
- The Node SDK builds its own native addon from packaged C++ sources. It does not load a file from the React Native package.
- Cactus is imported from `@larkxai/react-native/cactus`. The root React Native import does not load it.
- The TypeScript execution engine is removed. Import `createRuntime`, `defineTool`, `scriptedModel`, and `sqlite` from `@larkxai/react-native`.
- `@larkxai/core`, `@larkxai/agent`, `@larkxai/storage-memory`, `@larkxai/storage-sqlite`, and `@larkxai/testing` are no longer published from this repository.
- There is no migration from a TypeScript-engine database or from an earlier native preview database. Open a new SQLite file. The runtime stamps `application_id` `0x4C585254` and rejects any other file without modifying it.
- The metadata telemetry client remains internal. The C++ runtime does not export it.

## 0.1.0

First implementation of local durable execution.

- `@larkxai/protocol` defines protocol version 1: states, transitions, effects, events, errors, canonical JSON values, and the remote dispatch request shape.
- `@larkxai/core` runs local workflows with replay, retries, cancellation, ownership leases, and blocked recovery for unknown non-idempotent outcomes.
- `@larkxai/storage-memory` and `@larkxai/storage-sqlite` share one reducer. SQLite schema version is 1.
- `@larkxai/node` opens a SQLite file with Node's experimental `node:sqlite` and can reclaim a run whose previous process is dead.
- `examples/node-workflow` demonstrates committed steps surviving `SIGKILL`.
- Cloud execution, agents, React Native, and the managed cloud service are not included.
