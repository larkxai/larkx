# Roadmap

LarkX is built in milestones. A milestone is done when the behavior exists in this repository and the automated checks that belong to it pass. Design notes are not implementations.

## M0 — Repository foundation

Done in this tree.

- pnpm workspace, Turborepo, TypeScript strict mode, ESLint, Prettier, Vitest, Changesets.
- GitHub Actions runs install, build, typecheck, lint, format, and tests. The `release` job then versions and publishes the public packages.
- `@larkxai/protocol` version 1: identifiers, states, transitions, effects, events, errors, payload rules, dispatch types, capabilities.
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

- `@larkxai/react-native` opens Expo SQLite through the existing `SqliteDriver` interface and the existing schema.
- `openReactNativeEngine` plus `recover()` on launch and when the app becomes active.
- Exclusive ownership: a suspended runtime stays the owner after the lease expires. A new JavaScript realm may take the run because the previous owner is no longer registered.
- Local artifact copy into application storage before the step result is returned.
- `examples/react-native-workflow` is the local demo. It does not call a network API.

The adapter does not promise background execution after the operating system has killed the app. Recovery happens when the app is allowed to run again. Native background scheduling is not part of M2.

## M3 — Durable agents and Cactus

Implemented in this tree. Automated tests run on Node.js with a scripted model, including `SIGKILL` against SQLite. The Cactus screen has not been run on an emulator or a device in this change.

- `@larkxai/agent`: `ModelAdapter`, `defineTool`, and `createAgent` on the existing engine.
- One durable step per model decision and per tool call. No second log.
- Replay of committed decisions and tool results.
- A deterministic scripted model for tests and for the React Native test mode.
- `@larkxai/cactus` against `cactus-react-native` 1.13.1. Download and `init` stay outside the agent run.
- `examples/node-agent` and `examples/react-native-agent`.
- The native React Native host schedules execution from `agent.start()`. `run.result()` waits. `@larkxai/cactus` can be the model for that host. `examples/react-native-workflow` includes a field-inspection screen. Physical-device validation is still pending. The checklist is [docs/validation/on-device-agent.md](docs/validation/on-device-agent.md).

Not part of M3:

- Ollama, RunAnywhere, and LangGraph.
- Token-level inference resume or KV-cache persistence.
- Parallel tool calls.
- Agent runs use the existing journal. See [the observability spec](docs/cloud-observability-spec.md).

## M4 — Cloud observability

`@larkxai/telemetry` is the optional client. `larkxai/cloud` remains the private ingestion side. The boundary is [docs/cloud-observability-spec.md](docs/cloud-observability-spec.md) and [docs/architecture/telemetry.md](docs/architecture/telemetry.md). Cloud does not claim ownership, retry steps, or write local workflow state.

- Metadata-only export of the existing journal. Agent name and version are the workflow name and version. Step keys distinguish model and tool steps. Attempt timestamps are the durations.
- Prompts, model responses, tool arguments, tool outputs, and artifacts stay on the device. The exporter uses a payload allowlist.
- No new event type. Provider and model id sit on the step output, which stays on the device. A future non-sensitive field needs a telemetry version and a Cloud change first.
- Billing, accounts, and enterprise permissions stay out of the public repository.
- Automated coverage is in `tests/telemetry`. A physical-device timeline was not captured for this change. The procedure is in [docs/validation/m4-physical-device.md](docs/validation/m4-physical-device.md).

## M5 — Developer experience and additional integrations

Not started.

- More examples, clearer errors, and subscription samples.
- Release process: Changesets publishes `@larkxai/*` from `main` with the organization `NPM_TOKEN`. Android Maven and iOS Swift packages are separate repositories. The first successful npm publish confirms the `@larkxai` scope.
- Further model providers after their SDKs are checked. Ollama is the first candidate for Node. Nothing here implies RunAnywhere or LangGraph.
- Performance measurements. `benchmarks/` currently records that no numbers have been taken.

## M6 — Hybrid execution

Not started. The dispatch types in `@larkxai/protocol` are the contract to implement, not a working transport.

- Persist the dispatch intent before sending it.
- Stable operation ids across network retries.
- HTTP transport, worker SDK, and a durable reference coordinator.
- Deduplicate accepted tasks. Survive coordinator restart.
- Recover results after the device reconnects.
- Refuse a local fallback while a remote side effect might still complete.
- Keep `device-only` as the default.

The reference coordinator is a development tool. It is not LarkX Cloud.

## M7 — Native runtime and Rust, if justified

The shared execution direction is the C++ core under `native/`. A Rust core is only justified for pieces that profiling shows that core cannot meet. It would not execute TypeScript callbacks inside Rust.

- Swift and Kotlin SDKs. Not started. They belong in `larkxai/ios` and `larkxai/android` and must not embed a JavaScript engine.
- Native background scheduling.
- Resource-aware routing once real capability adapters exist.
- Multi-device ownership transfer and a reconciliation protocol that makes it safe.

## Native core — Phase 1 and Phase 2

Started in `native/`. This is not a shipped SDK and it does not replace `@larkxai/core`.

Present in this tree:

- C++20 reducer for the protocol version 1 state machines, ownership fences, step attempts, reconciliation, and outbox dedupe.
- SQLite schema version 1 and C ABI version 2 in `native/abi/include/larkx.h`.
- An agent loop: register an agent, start a run, drive model and tool requests, submit results, pause, cancel, and reconcile. Committed outputs are replayed. Interrupted non-idempotent tools block.
- The frozen tables in `native/conformance/transitions.json`, checked by the native tests and by `tests/native/conformance-fixtures.test.ts`. The agent loop is checked by `native/core/tests/agent_tests.cpp`.
- A pure Swift host in `examples/swift-agent`. The macOS CI job compiles and runs it. Linux CI does not.
- A preview React Native host at `@larkxai/react-native/native`. It calls this core through a native module. The default package export is still the TypeScript engine.
- Host build and `ctest` on Linux. The Node addon in `packages/react-native` links the same core for the React Native host tests.

Not present:

- A production Swift or Kotlin SDK.
- Model provider adapters inside the core, including Cactus.
- Remote-agent submission, A2A, or telemetry export.
- A device or emulator recovery run. The React Native preview binding is not that proof.

The plan, the ABI decisions, and the later phases are in [docs/native/migration.md](docs/native/migration.md). Cloud follow-ups that this phase does not implement are in [docs/native/cloud-changes.md](docs/native/cloud-changes.md).
