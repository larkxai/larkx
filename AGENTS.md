# AGENTS.md

Instructions for people and coding agents changing LarkX.

## What this repository is

LarkX is an independent durable execution engine for on-device and hybrid AI agents. The public repository holds the open protocol, the local runtime, storage adapters, and a small reference surface for later remote execution. The managed commercial control plane belongs in `larkxai/cloud`, not here.

## What is implemented

- `@larkx/protocol` — version 1 contracts, state machines, errors, dispatch types.
- `@larkx/core` — local workflow runtime: registration, steps, replay, recovery, ownership, history.
- `@larkx/storage-memory` — process-local storage.
- `@larkx/storage-sqlite` — schema version 1 and a driver-agnostic SQLite adapter.
- `@larkx/node` — `node:sqlite` driver, pid-file ownership reclaim, `createNodeEngine`.
- `@larkx/react-native` — Expo SQLite driver, mobile ownership, lifecycle binding, local artifact copy, and a display hook.
- `@larkx/testing` — fake clocks and storage conformance cases.
- `examples/node-workflow` — the Node process-death demo.
- `examples/react-native-workflow` — the Expo demo. Node tests do not prove it ran on a device.

Do not add a package that only re-exports types or throws "not implemented" and then document it as shipped. Planned packages stay in [ROADMAP.md](ROADMAP.md) until they have behavior and tests.

## Invariants

- `@larkx/protocol`, `@larkx/core`, `@larkx/storage-memory`, and `@larkx/storage-sqlite` must not import `node:*`, `react-native`, `fs`, `path`, or a database driver. ESLint and `tests/boundaries/imports.test.ts` enforce this.
- The core must not depend on a model SDK or agent framework.
- Memory and SQLite storage both persist by running the reducer in `@larkx/core`. Do not special-case transitions in one adapter.
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
- A green Node suite is not mobile validation. The React Native package has Node tests for its ownership policy, artifact copy, and lifecycle binding, including `SIGKILL` against the mobile storage adapter backed by `node:sqlite`. Do not describe that as an emulator or device run.

## Local commands

```bash
pnpm install
pnpm build
pnpm typecheck
pnpm lint
pnpm format:check
pnpm test
```

Node.js must be 22.13 or newer. The lockfile is pinned to pnpm 10.33.4.

## Changes that need extra care

- State-machine edits belong in `@larkx/protocol` and the reducer together. Update the transition tests.
- JSON encoding is canonical and rejects `undefined`, `NaN`, infinities, `bigint`, functions, symbols, and class instances. `undefined` step results are stored as JSON `null`.
- Ownership commits carry an epoch fence. A stolen or expired claim must not let the old owner write.
- New execution targets need a durable outbox, dedupe on a stable operation id, and tests for lost acknowledgements. Do not add an in-memory HTTP server as the only proof of remote recovery.

## Publishing

Do not configure public npm publish. Changesets are set to restricted access. There is no registry token in this repository.
