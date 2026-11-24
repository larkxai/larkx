# Changelog

This file summarizes user-visible changes. Public packages share one version and publish to npm from `main`.

## Unreleased

- `@larkxai/react-native` runs the existing engine on Expo SQLite, with mobile ownership, foreground recovery, and local artifact copies.
- Storage can use exclusive ownership so an expired lease is not treated as a dead executor.
- Stopping a run cancels its heartbeat timer instead of leaving that timer until the next interval.
- `examples/react-native-workflow` is a local demo. It has not been executed on an emulator or a device in CI.

## 0.1.0

First implementation of local durable execution.

- `@larkxai/protocol` defines protocol version 1: states, transitions, effects, events, errors, canonical JSON values, and the remote dispatch request shape.
- `@larkxai/core` runs local workflows with replay, retries, cancellation, ownership leases, and blocked recovery for unknown non-idempotent outcomes.
- `@larkxai/storage-memory` and `@larkxai/storage-sqlite` share one reducer. SQLite schema version is 1.
- `@larkxai/node` opens a SQLite file with Node's experimental `node:sqlite` and can reclaim a run whose previous process is dead.
- `examples/node-workflow` demonstrates committed steps surviving `SIGKILL`.
- Cloud execution, agents, React Native, and the managed cloud service are not included.
