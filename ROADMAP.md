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

Implemented in this tree. Automated tests run on Node.js. An emulator or device run is still required before calling the mobile path validated.

- `@larkx/react-native` opens Expo SQLite through the existing `SqliteDriver` interface and the existing schema.
- `openReactNativeEngine` plus `recover()` on launch and when the app becomes active.
- Exclusive ownership: a suspended runtime stays the owner after the lease expires. A new JavaScript realm may take the run because the previous owner is no longer registered.
- Local artifact copy into application storage before the step result is returned.
- `examples/react-native-workflow` is the local demo. It does not call a network API.

The adapter does not promise background execution after the operating system has killed the app. Recovery happens when the app is allowed to run again. Native background scheduling is not part of M2.

## M3 — Durable agents and Cactus

Implemented in this tree. Automated tests run on Node.js with a scripted model, including `SIGKILL` against SQLite. The Cactus screen has not been run on an emulator or a device in this change.

- `@larkx/agent`: `ModelAdapter`, `defineTool`, and `createAgent` on the existing engine.
- One durable step per model decision and per tool call. No second log.
- Replay of committed decisions and tool results.
- A deterministic scripted model for tests and for the React Native test mode.
- `@larkx/cactus` against `cactus-react-native` 1.13.1. Download and `init` stay outside the agent run.
- `examples/node-agent` and `examples/react-native-agent`.

Not part of M3:

- Ollama, RunAnywhere, and LangGraph.
- Token-level inference resume or KV-cache persistence.
- Parallel tool calls.
- A Cloud exporter. Agent runs use the existing journal. See [the observability spec](docs/cloud-observability-spec.md).

## M4 — Cloud observability

Not started in this repository. `larkxai/cloud` is the private ingestion side. The passive boundary is already written in [docs/cloud-observability-spec.md](docs/cloud-observability-spec.md). This tree does not export telemetry. Cloud must not claim ownership, retry steps, or write local workflow state.

- Metadata-only export of the existing journal. Agent name and version are the workflow name and version. Step keys distinguish model and tool steps. Attempt timestamps are the durations.
- Do not upload prompts, model responses, tool arguments, tool outputs, or artifacts by default.
- No new event type until the Cloud repository agrees. Provider and model id currently sit on the step output, which stays on the device.
- Billing, accounts, and enterprise permissions stay out of the public repository.

## M5 — Developer experience and additional integrations

Not started.

- More examples, clearer errors, and subscription samples.
- A documented release process once the `@larkx` npm scope is confirmed and credentials exist.
- Further model providers after their SDKs are checked. Ollama is the first candidate for Node. Nothing here implies RunAnywhere or LangGraph.
- Performance measurements. `benchmarks/` currently records that no numbers have been taken.

## M6 — Hybrid execution

Not started. The dispatch types in `@larkx/protocol` are the contract to implement, not a working transport.

- Persist the dispatch intent before sending it.
- Stable operation ids across network retries.
- HTTP transport, worker SDK, and a durable reference coordinator.
- Deduplicate accepted tasks. Survive coordinator restart.
- Recover results after the device reconnects.
- Refuse a local fallback while a remote side effect might still complete.
- Keep `device-only` as the default.

The reference coordinator is a development tool. It is not LarkX Cloud.

## M7 — Native runtime and Rust, if justified

Not scheduled as implementation work. A Rust core is only justified for pieces that profiling shows the TypeScript runtime cannot meet. It would not execute TypeScript callbacks inside Rust.

- Swift and Kotlin SDKs.
- Native background scheduling.
- Resource-aware routing once real capability adapters exist.
- Multi-device ownership transfer and a reconciliation protocol that makes it safe.
