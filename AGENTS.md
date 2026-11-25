# AGENTS.md

Instructions for people and coding agents changing LarkX.

## What this repository is

LarkX is an independent durable execution engine for on-device and hybrid AI agents. The public repository holds the open protocol, the local runtime, storage adapters, and a small reference surface for later remote execution. The managed commercial control plane belongs in `larkxai/cloud`, not here.

## What is implemented

- `@larkxai/protocol` — version 1 contracts, state machines, errors, dispatch types.
- `@larkxai/core` — local workflow runtime: registration, steps, replay, recovery, ownership, history.
- `@larkxai/storage-memory` — process-local storage.
- `@larkxai/storage-sqlite` — schema version 1 and a driver-agnostic SQLite adapter.
- `@larkxai/node` — `node:sqlite` driver, pid-file ownership reclaim, `createNodeEngine`.
- `@larkxai/react-native` — Expo SQLite driver, mobile ownership, lifecycle binding, local artifact copy, and a display hook. The default export is that TypeScript adapter. `@larkxai/react-native/native` is a preview host for the shared C++ core and does not replace it.
- `@larkxai/testing` — fake clocks and storage conformance cases.
- `examples/node-workflow` — the Node process-death demo.
- `examples/react-native-workflow` — the Expo demo. The TypeScript workflow stays on screen. A second card drives a scripted agent through the C++ core when a development build is installed. Node tests do not prove it ran on a device.
- `native/` — C++20 execution core and C ABI version 2. The agent loop drives model and tool requests and persists their results. The TypeScript engine remains the shipped runtime. See [docs/native/migration.md](docs/native/migration.md). A host `ctest` run is not an iOS or Android binary, and it does not compile `examples/swift-agent`.

Do not add a package that only re-exports types or throws "not implemented" and then document it as shipped. Planned packages stay in [ROADMAP.md](ROADMAP.md) until they have behavior and tests.

## Invariants

- `@larkxai/protocol`, `@larkxai/core`, `@larkxai/storage-memory`, and `@larkxai/storage-sqlite` must not import `node:*`, `react-native`, `fs`, `path`, or a database driver. ESLint and `tests/boundaries/imports.test.ts` enforce this.
- The core must not depend on a model SDK or agent framework.
- Memory and SQLite storage both persist by running the reducer in `@larkxai/core`. Do not special-case transitions in one adapter.
- `workflow_runs` and `workflow_steps` are authoritative. `workflow_events` is an append-only journal in the same transaction. Replay does not fold events back into state.
- Completed step handlers do not run again. Step keys are caller-supplied, not source locations.
- `pure` and `idempotent` interrupted steps may retry. `idempotent` retries keep the same `operationId`. `non-idempotent` interrupted steps become `UNKNOWN_OUTCOME` and the run becomes `BLOCKED`.
- Do not describe external effects as exactly-once.
- Default data policy is `device-only`. Cloud and hybrid steps must not run local handlers while pretending to dispatch.
- Do not store model chain-of-thought. The event journal rejects payload keys `input`, `output`, `messages`, `prompt`, `toolResult`, and `content`.
- Terminal workflow statuses (`COMPLETED`, `FAILED`, `CANCELLED`) have no exits. `FAILED` is not retried in place. `BLOCKED` moves only through reconcile.
- Protocol version, storage schema version, and workflow definition version are three different numbers. A missing workflow version blocks the run. It is not replayed on a different version.
- `close()` waits for in-flight steps, releases ownership, and must not be called from an engine hook.

## Tests

- `pnpm test` builds `dist` and runs Vitest. Package exports point at `dist`, so a stale build looks like a logic bug.
- Crash tests spawn `examples/node-workflow/dist/main.js` and send `SIGKILL`. Do not replace them with a thrown exception.
- Tests that use `createAutoClock` must set `leaseMs: 0`. The auto clock is not safe with heartbeats.
- Node may print `ExperimentalWarning: SQLite is an experimental feature`. That is expected with `node:sqlite`.
- A green Node suite is not mobile validation. The React Native package has Node tests for its ownership policy, artifact copy, and lifecycle binding, including `SIGKILL` against the mobile storage adapter backed by `node:sqlite`. `tests/react-native/native-core.test.ts` drives the real C++ core through a Node addon. Do not describe either as an emulator or device run.
- Native core: `cmake -S native -B native/build -DCMAKE_BUILD_TYPE=Release && cmake --build native/build && ctest --test-dir native/build --output-on-failure`. Requires CMake, a C++20 compiler, and SQLite 3 development headers. Do not describe that host run as device recovery. Do not delete the TypeScript engine because this suite is green.

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
```

Node.js must be 22.13 or newer. The lockfile is pinned to pnpm 10.33.4.

## Changes that need extra care

- State-machine edits belong in `@larkxai/protocol` and the reducer together. Update the transition tests.
- JSON encoding is canonical and rejects `undefined`, `NaN`, infinities, `bigint`, functions, symbols, and class instances. `undefined` step results are stored as JSON `null`.
- Ownership commits carry an epoch fence. A stolen or expired claim must not let the old owner write.
- New execution targets need a durable outbox, dedupe on a stable operation id, and tests for lost acknowledgements. Do not add an in-memory HTTP server as the only proof of remote recovery.

## Publishing

`.github/workflows/ci.yml` is the build. `.github/workflows/release.yml` publishes public packages from `main` after that build succeeds, including GitHub Releases and GitHub Packages. The npm scope is `@larkxai`. Changesets `access` is `public`. Do not commit a registry token. Do not publish the root package or anything in `examples/`. The unscoped npm name `larkx` is an unrelated project. One `NPM_TOKEN` covers the whole `@larkxai` scope. Android (`ai.larkx` on Maven Central) and iOS (Swift package `LarkX`) are separate repositories and do not use that token. `@larkxai/react-native` publishes from this repository until `larkxai/react-native` exists; do not publish that name from both. `@larkxai/node` requires Node.js 22.13 or newer. The telemetry exporter's default `sdkVersion` is the `@larkxai/telemetry` package version; `pnpm version-packages` keeps that constant aligned.
