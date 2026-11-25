# AGENTS.md

Instructions for people and coding agents changing LarkX.

## What this repository is

LarkX is a durable execution engine for on-device AI agents. One C++ runtime owns orchestration, persistence, replay, and recovery. Node.js and React Native bind that runtime. Optional Cloud observability belongs in `larkxai/cloud`, not here.

## What is implemented

- `@larkxai/protocol` — version 1 states, errors, effect classes, and canonical JSON.
- `native/` — the C++ runtime. ABI version 2. SQLite schema version 1. The agent loop asks the host to invoke a model or a tool and then commits the submitted result.
- `@larkxai/host` — the TypeScript driver. It does not plan steps. It must not import React Native, Node, Expo, or Cactus.
- `@larkxai/node` — Node SDK. The addon is built by `packages/react-native/scripts/build-node-addon.sh`.
- `@larkxai/react-native` — the public React Native SDK. `createRuntime`, `defineTool`, and `sqlite` come from the package root. Expo Go cannot load the native module.
- `@larkxai/cactus` — optional Cactus adapter. The C++ runtime does not import it.
- `@larkxai/telemetry` — metadata batch contract and HTTP client. It is not fed by the C++ journal.
- `examples/node-agent` — scripted Node agent and the `SIGKILL` demo.
- `examples/react-native-workflow` — scripted agent, Cactus agent, and field inspection. Node tests do not prove it ran on a device.
- `examples/swift-agent` — minimal Swift host for the C ABI. It is not a production Swift SDK.

Do not add a package that only re-exports types or throws "not implemented" and then document it as shipped. Planned work stays in [ROADMAP.md](ROADMAP.md) until it has behavior and tests.

`@larkxai/core`, `@larkxai/agent`, `@larkxai/storage-memory`, `@larkxai/storage-sqlite`, and `@larkxai/testing` are removed. Do not restore them. See [docs/obsolete-packages.md](docs/obsolete-packages.md).

## Invariants

- `@larkxai/protocol`, `@larkxai/host`, and `@larkxai/telemetry` must not import `node:*`, `react-native`, `fs`, `path`, a database driver, or a model provider. ESLint and `tests/boundaries/imports.test.ts` enforce this.
- The C++ runtime must not depend on React Native, Node.js, Cactus, or another model SDK.
- `workflow_runs` and `workflow_steps` are authoritative. `workflow_events` is an append-only journal in the same transaction. Replay does not fold events back into state.
- The core assigns agent step keys. Completed model and tool steps are not executed again.
- `pure` and `idempotent` interrupted steps may retry. `idempotent` retries keep the same `operationId`. `non-idempotent` interrupted steps become `UNKNOWN_OUTCOME` and the run becomes `BLOCKED`.
- Do not describe external effects as exactly-once.
- Default data policy is `device-only`.
- Do not store model chain-of-thought. The event journal rejects payload keys `input`, `output`, `messages`, `prompt`, `toolResult`, and `content`.
- Terminal statuses (`COMPLETED`, `FAILED`, `CANCELLED`) have no exits. `FAILED` is not retried in place. `BLOCKED` moves only through reconcile.
- Protocol version, storage schema version, and agent definition version are three different numbers. A run is not replayed on a different agent version.
- Do not delete an existing application database as part of opening the runtime. Do not migrate a TypeScript-engine database.

## Tests

- `pnpm test` builds `dist` and runs Vitest. Package exports point at `dist`, so a stale build looks like a logic bug.
- Crash tests spawn `examples/node-agent/dist/main.js` and send `SIGKILL`. Do not replace them with a thrown exception.
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
sh packages/react-native/scripts/build-node-addon.sh
```

Node.js must be 22.13 or newer. The lockfile is pinned to pnpm 10.33.4.

## Changes that need extra care

- State-machine edits belong in the C++ reducer and the protocol transition tables together. Update the native tests and `tests/protocol`.
- JSON encoding is canonical and rejects `undefined`, `NaN`, infinities, `bigint`, functions, symbols, and class instances. `undefined` step results are stored as JSON `null`.
- Ownership commits carry an epoch fence. A stolen or expired claim must not let the old owner write.
- New execution targets need a durable outbox, dedupe on a stable operation id, and tests for lost acknowledgements. Do not add an in-memory HTTP server as the only proof of remote recovery.

## Publishing

`.github/workflows/ci.yml` is the build. `.github/workflows/release.yml` publishes public packages from `main` after that build succeeds, including GitHub Releases and GitHub Packages. The npm scope is `@larkxai`. Changesets `access` is `public`. Do not commit a registry token. Do not publish the root package or anything in `examples/`. The unscoped npm name `larkx` is an unrelated project. One `NPM_TOKEN` covers the whole `@larkxai` scope. `@larkxai/node` requires Node.js 22.13 or newer. The telemetry exporter's default `sdkVersion` is the `@larkxai/telemetry` package version; `pnpm version-packages` keeps that constant aligned.
