# Roadmap

LarkX is building durable orchestration for on-device AI agents. The near-term priority is one validated React Native SDK with hybrid agent capabilities, not three independent production SDKs.

A capability is implemented when code and relevant automated checks exist. Mobile validation and publication are separate gates. Future milestones below are ordered by dependency, not fixed PR numbers.

## Current delivery status

| Milestone | Status |
| --- | --- |
| Native C++ foundation (PR #24) | Merged |
| Native autonomous agent runtime (PR #25) | Merged |
| React Native native host (PR #26) | Implemented |
| Cactus and mobile recovery demo (PR #28) | Merged; physical-device validation pending |
| Durable remote delegation | Next |
| A2A integration | Planned |
| Privacy and egress policies | Planned |
| Native telemetry | Planned |
| Cloud integration | Planned |
| Developer preview release | Planned |
| Standalone Swift and Kotlin SDKs | Deferred |

## Next — Physical-device validation

The [validation checklist](docs/validation/on-device-agent.md) must be completed on actual phones before claiming mobile durability or real local inference.

- Build the complete React Native application for iOS and Android.
- Run Cactus inference and autonomous tool selection.
- Verify offline operation with an installed model.
- Kill and relaunch at committed and interrupted operation boundaries.
- Verify stable operation IDs, replay, deduplication and explicit reconciliation.
- Record measured performance and platform limitations.

Remote delegation development may proceed in parallel. Hardware validation remains a release gate.

## Next — Durable remote agent delegation

Implement a first-class RemoteAgent capability and a custom asynchronous HTTP task adapter. The device owns the parent run; remote agents are independently deployed.

- Persist authorized delegation intent, stable client operation ID and outbox atomically before sending.
- Persist the remote task ID separately on acceptance.
- Recover pending submissions, poll accepted tasks and commit results before continuing local reasoning.
- Model queued, submitting, accepted, working, input required, completed, failed, cancelled and unknown-outcome states.
- Retry uncertain submissions only with verified deduplication or reconciliation; otherwise block for explicit reconciliation.
- Enforce basic outbound authorization before sending, including retries and recovery.
- Version protocol and storage changes and add crash-window conformance tests.
- Use a reference remote agent for integration tests, not a hosted execution platform.

## A2A interoperability

- Pin the supported A2A protocol version.
- Map discovery, submission, task status, artifacts, input-required interaction and cancellation to the shared delegation state machine.
- Keep client operation, remote message, task and context identities distinct.
- Declare peer capabilities explicitly; A2A alone does not guarantee idempotent submission.
- Validate lost acknowledgements, delayed results and recovery after device process death.

## Privacy-aware orchestration

- Separate execution placement from permission to transmit data.
- Default deny unauthorized SDK-managed egress.
- Apply destination-specific allowlists, redaction and secure credential references.
- Enforce policies for cloud models, remote tools and remote agents, including recovered operations.
- Treat telemetry consent independently.
- Do not claim control over arbitrary custom host code or network access.

## Native telemetry

- Version the cross-platform metadata contract and retain compatibility where practical.
- Export run, model, tool, recovery, reconciliation and delegation metadata.
- Exclude raw prompts, outputs, tool arguments, credentials and private data.
- Persist delivery cursors and retry independently of agent execution.
- Keep Cloud optional.

## LarkX Cloud integration

Implement in the separate Cloud repository after SDK contracts stabilize.

- Strict server-side event payload allowlists.
- Agent, run, device and installation views.
- Remote delegation and recovery timelines.
- Deduplicated logical-operation metrics.
- Compatibility tests with the SDK.

Cloud observes execution; it does not own parent runs or invent retries.

## Developer preview release

- Validate clean installation from packed npm artifacts.
- Complete physical-device checks and document supported environments.
- Publish stable preview interfaces, quick starts and local/hybrid examples.
- Measure real performance and document recovery limitations.
- Verify optional Cloud integration and update website/demo claims.

## Deferred — Platform expansion

- Standalone Swift SDK and Swift Package Manager distribution.
- Standalone Kotlin SDK and Maven-compatible distribution.
- Native background scheduling where operating systems permit it.
- Resource-aware routing and distributed run migration only after a dedicated design.

Keep the C++ core, C ABI and conformance fixtures platform-independent. React Native must not depend on the standalone SDKs.

Agent hosting, deployment and managed workers are not part of the current product roadmap.

## Historical TypeScript milestones

The following M0–M4 milestones preserve the context of the existing shipped TypeScript engine. They do not imply native feature parity.

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


## Native architecture reference

See [native migration](docs/native/migration.md), [Cloud follow-ups](docs/native/cloud-changes.md) and [physical-device validation](docs/validation/on-device-agent.md).
