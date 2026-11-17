# Roadmap

LarkX is built in milestones. A milestone is done when the behavior exists in this repository and the automated checks that belong to it pass. Design notes are not implementations.

## M0 — Repository foundation

Done in this tree.

- pnpm workspace, Turborepo, TypeScript strict mode, ESLint, Prettier, Vitest, Changesets.
- GitHub Actions runs install, build, typecheck, lint, format, and tests. It does not publish packages.
- `@larkx/protocol` version 1: identifiers, states, transitions, effects, events, errors, payload rules, dispatch types, capabilities.
- Architecture and execution RFCs, plus the architecture notes under `docs/`.

## M1 — Local durable execution

Done in this tree for Node.js.

- Workflow registration, typed inputs and outputs, explicit run ids.
- Local steps with `pure`, `idempotent`, and `non-idempotent` effects.
- Memory storage and SQLite storage.
- Replay of completed steps, recovery after `SIGKILL`, execution history.
- Single-owner leases, epoch fencing, and Node pid-file reclaim when the previous process is dead.
- Blocked runs for unknown outcomes, missing workflow versions, protocol mismatches, and replay divergence.
- Runnable example: `examples/node-workflow`.

Not part of M1, even though some types exist:

- Executing cloud or hybrid steps.
- Copying artifact bytes. The artifact table stores metadata only.
- React Native.

## M2 — React Native

Not started.

- A SQLite driver behind the existing `SqliteDriver` interface.
- Engine startup and `recover()` when the application runtime is available.
- Lifecycle and connectivity signals.
- A local-only demo that does not require a network.
- Device or emulator tests, reported separately from the Node suite.

The first mobile release still will not promise background execution after the operating system has killed the app. Recovery happens when the app is allowed to run again.

## M3 — Durable agents

Not started.

- `ModelAdapter`, `defineTool`, and `createAgent` on top of the workflow engine.
- One durable step per model decision and per tool call.
- Replay of committed decisions. No second durability log inside the agent layer.
- A deterministic fake model for tests.
- A Cactus adapter written against the current Cactus SDK, after that API is inspected.
- Ollama as an optional Node development adapter.
- RunAnywhere and LangGraph only after their APIs are checked. They are not implied by this roadmap item.

## M4 — Hybrid execution

Not started. The dispatch types in `@larkx/protocol` are the contract to implement, not a working transport.

- Persist the dispatch intent before sending it.
- Stable operation ids across network retries.
- HTTP transport, worker SDK, and a durable reference coordinator.
- Deduplicate accepted tasks. Survive coordinator restart.
- Recover results after the device reconnects.
- Refuse a local fallback while a remote side effect might still complete.
- Keep `device-only` as the default.

The reference coordinator is a development tool. It is not LarkX Cloud.

## M5 — Developer experience

Not started.

- More examples, clearer errors, and subscription samples.
- A documented release process once the `@larkx` npm scope is confirmed and credentials exist.
- Performance measurements. `benchmarks/` currently records that no numbers have been taken.

## M6 — Commercial platform

Not in this repository.

`larkxai/cloud` is the planned private home for managed orchestration, fleet visibility, metering, authentication, and billing. The public repository should keep the protocol and a self-hostable reference coordinator. It should not grow a billing system.

## M7 — Later expansion

Not scheduled as implementation work.

- A Rust core for selected state-machine and storage pieces, without executing TypeScript callbacks inside Rust.
- Swift and Kotlin SDKs.
- Native background scheduling.
- Resource-aware routing once real capability adapters exist.
- Multi-device ownership transfer and a reconciliation protocol that makes it safe.
