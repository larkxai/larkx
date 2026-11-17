# Contributing

LarkX is Apache-2.0. Contributions should keep the local execution engine correct before adding surface area.

## Setup

- Node.js 22.13 or newer.
- pnpm 10.33.4. The `packageManager` field is the source of truth.

```bash
pnpm install
pnpm build
pnpm typecheck
pnpm lint
pnpm format
pnpm test
```

`pnpm test` rebuilds packages and runs Vitest. Tests import published entry points in `dist/`.

## Scope of a change

Prefer a small change that preserves a guarantee over a wide feature. Read [AGENTS.md](AGENTS.md) before editing the runtime.

- Do not add an empty package and describe it as available.
- Do not import Node, React Native, or a database driver from `@larkx/protocol`, `@larkx/core`, `@larkx/storage-memory`, or `@larkx/storage-sqlite`.
- Do not add a model provider dependency to the core.
- State-machine changes start in `@larkx/protocol` and must be applied by the shared reducer.
- Crash-recovery changes need a `SIGKILL` test when they affect what survives process death.

## Packages

| Package                 | Role                                    |
| ----------------------- | --------------------------------------- |
| `@larkx/protocol`       | Contracts. No runtime dependency        |
| `@larkx/core`           | Durable workflow engine                 |
| `@larkx/storage-memory` | In-memory adapter for tests             |
| `@larkx/storage-sqlite` | Schema, migrations, shared SQL behavior |
| `@larkx/node`           | Node driver and `createNodeEngine`      |
| `@larkx/testing`        | Clocks and conformance helpers          |

The example `@larkx/example-node-workflow` is private and is not a library.

## Pull requests

- Explain which guarantee the change protects or which limitation it removes.
- Show the commands you ran. If a crash or storage test did not run, say so.
- Do not claim device, emulator, or provider coverage that the diff does not exercise.
- Do not add publish credentials or a public `release` workflow.

Changesets is installed with `access: restricted`. Use it to note a user-visible package change. It will not publish.

## Code style

TypeScript is strict, including `exactOptionalPropertyTypes` and `noUncheckedIndexedAccess`. ESLint uses type-aware-free recommended rules plus consistent type imports. Prettier uses the root `prettier.config.js`.

Workflow and step identifiers are validated. Do not derive step identity from line numbers.

## License

By contributing, you agree that your contributions are licensed under the Apache License 2.0.
