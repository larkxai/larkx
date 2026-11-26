# AGENTS.md

Instructions for people and coding agents changing LarkX.

## What this repository is

LarkX is the durable execution runtime for mobile-first, offline-first AI agents. It fills gaps in the existing agent ecosystem. It does not replace LangGraph, Google ADK, the OpenAI Agents SDK, or an inference engine.

One C++ runtime owns orchestration, the SQLite execution record, and remote delegation state. `@larkxai/react-native` is the only public npm SDK. `@larkxai/node` is a private workspace package used to test that runtime without building a mobile application. Both use one host driver. The host sends HTTP. Optional Cloud observability belongs in `larkxai/cloud`, not here. This repository does not host remote agents.

## Product and engineering philosophy

LarkX is an early-stage product. Prefer a working integration and a validated device run over a new subsystem.

### Integrate before building

Before implementing a capability, check whether a library, framework, or standard already solves it. Prefer that integration.

### Focus on differentiation

Build infrastructure only when it addresses an on-device execution requirement that existing solutions do not cover well enough: durable local execution, offline operation, the mobile process lifecycle, embedded persistence, native device tools, constrained resources, and durable coordination with a remote agent.

### Avoid unnecessary competition

Do not build a second server-side agent framework, a model host, an inference engine, or a proprietary agent protocol when an established project already covers that problem. A custom replacement needs a validated customer requirement.

### Prioritize time to market

Developer adoption, working integrations, physical-device validation, and customer feedback come before architectural completeness.

Before a significant feature, answer:

1. What specific problem are we solving?
2. Does an existing solution already solve it?
3. Can we integrate that solution?
4. Does this feature strengthen on-device differentiation?
5. Is it necessary at the current stage?

### Build, integrate, or leave out

| Capability                             | Strategy        |
| -------------------------------------- | --------------- |
| Durable on-device execution            | Build           |
| Mobile lifecycle management            | Build           |
| Offline-first agent execution          | Build           |
| Embedded execution persistence         | Build           |
| Native device integration              | Build           |
| Durable remote task coordination       | Build           |
| Privacy-aware orchestration            | Build           |
| Local model inference                  | Integrate       |
| Server-side agent orchestration        | Integrate       |
| Agent communication protocols          | Adopt standards |
| External tools                         | Integrate       |
| Cloud inference                        | Integrate       |
| Remote agent hosting                   | Out of scope    |
| Model training                         | Out of scope    |
| General-purpose server workflow engine | Out of scope    |

Local inference integrates Cactus and, when developers ask, other existing engines. Remote agents are independently deployed agents built with LangGraph, Google ADK, the OpenAI Agents SDK, or another framework that exposes a compatible interface. A2A is the planned standard for that link. The HTTP task transport stays as a generic mechanism and as the test foundation. It is not a proprietary ecosystem. MCP is a possible later integration for external tools, not current work. Cloud models enter through the model adapter. This repository does not host models or remote agents.

## What is implemented

- `native/` — the C++ runtime. ABI version 3. SQLite schema version 2. The agent loop asks the host to invoke a model, a tool, or a remote delegation and then commits the submitted result.
- `@larkxai/protocol` — private workspace module. Version 1 states, errors, effect classes, and canonical JSON. Bundled into `@larkxai/react-native`. Not published on its own.
- `@larkxai/host` — private workspace module. The TypeScript driver. It does not plan steps. It must not import React Native, Node, Expo, or Cactus.
- `@larkxai/node` — private Node host. It vendors the C++ sources and builds `packages/node/build/larkx_native.node` with `packages/node/scripts/build-native.sh`. Keep the addon, the crash tests, and the remote-delegation tests. Do not publish this package.
- `@larkxai/react-native` — the public npm SDK. `createRuntime` comes from the package root. Cactus is `@larkxai/react-native/cactus`. Expo Go cannot load the native module. Swift and Kotlin SDKs are planned and are not in this repository yet.
- `@larkxai/cactus` — private workspace module used by the React Native Cactus subpath. The C++ runtime does not import it. Node does not depend on it.
- `@larkxai/telemetry` — private workspace module. Metadata batch contract and HTTP client. The C++ runtime does not feed it a journal.
- `examples/node-agent` — scripted Node agent and the `SIGKILL` demo.
- `examples/node-hybrid` — local field agent plus the reference remote task fixture.
- `examples/remote-task` — development HTTP task fixture. Not a hosted product.
- `examples/react-native-agent` — scripted agent, Cactus agent, and field inspection, including an optional remote endpoint. Node tests do not prove it ran on a device.
- `examples/swift-agent` — minimal Swift host for the C ABI. It is not a production Swift SDK.

Do not add a public package that only re-exports types. Planned work stays in [ROADMAP.md](ROADMAP.md) until it has behavior and tests.

`@larkxai/core`, `@larkxai/agent`, `@larkxai/storage-memory`, `@larkxai/storage-sqlite`, and `@larkxai/testing` are removed. Do not restore them. `@larkxai/host`, `@larkxai/protocol`, `@larkxai/cactus`, and `@larkxai/telemetry` stay in the repo and are not published. See [docs/obsolete-packages.md](docs/obsolete-packages.md).

## Invariants

- `@larkxai/protocol`, `@larkxai/host`, and `@larkxai/telemetry` must not import `node:*`, `react-native`, `fs`, `path`, a database driver, or a model provider. ESLint and `tests/boundaries/imports.test.ts` enforce this.
- The C++ runtime must not depend on React Native, Node.js, Expo, Cactus, or another model SDK.
- The published React Native artifact must not depend on unpublished workspace packages. Bundle the host and protocol into `@larkxai/react-native`. The private Node host bundles them the same way so its pack tests stay honest.
- `workflow_runs` and `workflow_steps` are authoritative. `workflow_events` is an append-only journal in the same transaction. Replay does not fold events back into state.
- The core assigns agent step keys. Completed model and tool steps are not executed again.
- `pure` and `idempotent` interrupted steps may retry. `idempotent` retries keep the same `operationId`. `non-idempotent` interrupted steps become `UNKNOWN_OUTCOME` and the run becomes `BLOCKED`.
- Do not describe external effects as exactly-once.
- Default data policy is `device-only`. A run becomes `cloud-allowed` only when its agent registers at least one remote agent. Recovery must keep using the capabilities and endpoint stored with the delegation.
- Do not describe remote execution as exactly-once. An `Idempotency-Key` header is not proof that the peer dedupes.
- Do not persist credentials, prompts, or delegation arguments in the event journal. Arguments live on the delegation row. Credentials stay in the host.
- Do not store model chain-of-thought. The event journal rejects payload keys `input`, `output`, `messages`, `prompt`, `toolResult`, and `content`.
- Terminal statuses (`COMPLETED`, `FAILED`, `CANCELLED`) have no exits. `FAILED` is not retried in place. `BLOCKED` moves only through reconcile.
- Protocol version, storage schema version, and agent definition version are three different numbers. A run is not replayed on a different agent version.
- Do not delete an existing application database as part of opening the runtime. New databases carry SQLite `application_id` `0x4C585254`. Reject any other id. Do not migrate a TypeScript-engine database or an earlier native preview database.

## Tests

- `pnpm test` builds `dist` and runs Vitest. Package exports point at `dist`, so a stale build looks like a logic bug.
- Crash tests spawn `examples/node-agent/dist/main.js` and send `SIGKILL`. Do not replace them with a thrown exception.
- `tests/release/node-install.test.ts` packs `@larkxai/node`, installs it outside the repo, builds the addon there, and resumes a run.
- `tests/react-native/native-core.test.ts` drives the C++ core through the Node addon. That is not an emulator or a device run.
- Native core: `cmake -S native -B native/build -DCMAKE_BUILD_TYPE=Release && cmake --build native/build && ctest --test-dir native/build --output-on-failure`. A host `ctest` run does not compile `examples/swift-agent` and is not device recovery.
- Do not describe host compilation, a green Node suite, or a CI iOS or Android library build as physical-device validation.

## Local commands

```bash
pnpm install
pnpm build
pnpm typecheck
pnpm lint
pnpm format:check
pnpm test
cmake -S native -B native/build -DCMAKE_BUILD_TYPE=Release
cmake --build native/build
ctest --test-dir native/build --output-on-failure
sh packages/node/scripts/build-native.sh
sh packages/react-native/scripts/build-host-tests.sh
```

Node.js must be 22.13 or newer. The lockfile is pinned to pnpm 10.33.4.

## Changes that need extra care

- State-machine edits belong in the C++ reducer and the protocol transition tables together. Update the native tests and `tests/protocol`.
- JSON encoding is canonical and rejects `undefined`, `NaN`, infinities, `bigint`, functions, symbols, and class instances. `undefined` step results are stored as JSON `null`.
- Ownership commits carry an epoch fence. A stolen or expired claim must not let the old owner write.
- New execution targets need a durable outbox, dedupe on a stable operation id, and tests for lost acknowledgements. Do not add an in-memory HTTP server as the only proof of remote recovery.

## Publishing

`.github/workflows/ci.yml` is the build. `.github/workflows/release.yml` publishes `@larkxai/react-native` from `main` after that build succeeds, including GitHub Releases and GitHub Packages. The npm scope is `@larkxai`. Changesets `access` is `public`. There is no fixed version group. Private workspace packages, including `@larkxai/node`, are not versioned or tagged. Do not commit a registry token. Do not publish the root package, a private workspace package, or anything in `examples/`. The unscoped npm name `larkx` is an unrelated project. One `NPM_TOKEN` covers the whole `@larkxai` scope. Previously published `@larkxai/node` versions stay on the registry. Do not publish a new one from this repository. The Node host still requires Node.js 22.13 or newer. `pnpm version-packages` copies the `@larkxai/react-native` version into `SDK_VERSION` in `@larkxai/telemetry`.
