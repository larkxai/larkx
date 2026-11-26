# AGENTS.md

Instructions for people and coding agents changing LarkX.

## What this repository is

LarkX is an open-source, local-first durable orchestration runtime for on-device and hybrid AI agents. One C++ runtime owns orchestration, the SQLite execution record, and remote delegation state. `@larkxai/node` and `@larkxai/react-native` are the only published SDKs. They share one host driver. The host sends HTTP. Optional Cloud observability belongs in `larkxai/cloud`, not here. This repository does not host remote agents.

## What is implemented

- `native/` — the C++ runtime. ABI version 3. SQLite schema version 2. The agent loop asks the host to invoke a model, a tool, or a remote delegation and then commits the submitted result.
- `@larkxai/protocol` — private workspace module. Version 1 states, errors, effect classes, and canonical JSON. Bundled into the public SDKs. Not published on its own.
- `@larkxai/host` — private workspace module. The TypeScript driver. It does not plan steps. It must not import React Native, Node, Expo, or Cactus.
- `@larkxai/node` — public Node SDK. It vendors the C++ sources and builds `packages/node/build/larkx_native.node` with `packages/node/scripts/build-native.sh`.
- `@larkxai/react-native` — public React Native SDK. `createRuntime` comes from the package root. Cactus is `@larkxai/react-native/cactus`. Expo Go cannot load the native module.
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
- Published SDK artifacts must not depend on unpublished workspace packages. Bundle the host and protocol into `@larkxai/node` and `@larkxai/react-native`.
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

`.github/workflows/ci.yml` is the build. `.github/workflows/release.yml` publishes `@larkxai/node` and `@larkxai/react-native` from `main` after that build succeeds, including GitHub Releases and GitHub Packages. The npm scope is `@larkxai`. Changesets `access` is `public`. The fixed group is only those two packages. Private workspace packages are not versioned or tagged. Do not commit a registry token. Do not publish the root package, a private workspace package, or anything in `examples/`. The unscoped npm name `larkx` is an unrelated project. One `NPM_TOKEN` covers the whole `@larkxai` scope. `@larkxai/node` requires Node.js 22.13 or newer. `pnpm version-packages` copies the `@larkxai/node` version into `SDK_VERSION` in `@larkxai/telemetry`.
