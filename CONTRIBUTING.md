# Contributing

LarkX is Apache-2.0. Keep the C++ execution engine correct before adding surface area.

## Setup

- Node.js 22.13 or newer.
- pnpm 10.33.4. The `packageManager` field is the source of truth.
- CMake 3.20 or newer, a C++20 compiler, and SQLite 3 headers for the native tests.

```bash
pnpm install
pnpm build
pnpm typecheck
pnpm lint
pnpm format
pnpm test
```

`pnpm test` rebuilds packages and runs Vitest. Tests import published entry points in `dist/`. The Node addon is built with `sh packages/react-native/scripts/build-node-addon.sh` before the native host tests.

## Scope of a change

Read [AGENTS.md](AGENTS.md) before editing the runtime.

- Do not add an empty package and describe it as available.
- Do not import Node, React Native, a database driver, or a model provider from `@larkxai/protocol`, `@larkxai/host`, or `@larkxai/telemetry`.
- Do not add a model provider dependency to `native/`.
- State-machine changes start in the C++ reducer and the protocol tables together.
- Crash-recovery changes need a `SIGKILL` test when they affect what survives process death.
- Do not restore the TypeScript workflow engine.

## Packages

| Package                 | Role                                                            |
| ----------------------- | --------------------------------------------------------------- |
| `@larkxai/protocol`     | Contracts and canonical JSON. No runtime dependency             |
| `@larkxai/host`         | Driver that submits the model or tool result the core requested |
| `@larkxai/node`         | Node SDK over the shared C++ runtime                            |
| `@larkxai/react-native` | React Native SDK over the same runtime                          |
| `@larkxai/cactus`       | Optional Cactus model adapter                                   |
| `@larkxai/telemetry`    | Optional metadata exporter. Not attached to the native journal  |

Packages under `packages/` are the public SDK. The root package and everything in `examples/` are private. Removed packages are listed in [docs/obsolete-packages.md](docs/obsolete-packages.md).

## Pull requests

- Explain which guarantee the change protects or which limitation it removes.
- Show the commands you ran. If a crash or native test did not run, say so.
- Do not claim device, emulator, or provider coverage that the diff does not exercise.
- Do not add a registry token, an `.npmrc` auth line, or a second publish workflow.

## Publishing

Library packages publish together to npm as `@larkxai/*`. Changesets is configured with `access: public` and a fixed version group. Add a changeset for a user-visible package change. The removal of the TypeScript engine is a major change. The next published version of the fixed group is 0.2.0. A push to `main` that still has changesets opens a Version packages pull request. Merging that pull request publishes every library package at the new version.

[`.github/workflows/ci.yml`](.github/workflows/ci.yml) is the build status. [`.github/workflows/release.yml`](.github/workflows/release.yml) runs after that build succeeds on `main`. It builds `dist`, publishes to npm, publishes the same versions to GitHub Packages, and opens a GitHub Release for each package. The root package stays private because the unscoped name `larkx` belongs to an unrelated project.

One npm token covers every current and future `@larkxai` package. Do not commit it. Store it as the `NPM_TOKEN` Actions secret. `pnpm version-packages` bumps versions, refreshes the lockfile, and copies the `@larkxai/telemetry` version into `SDK_VERSION`.

## Code style

TypeScript is strict, including `exactOptionalPropertyTypes` and `noUncheckedIndexedAccess`. ESLint uses recommended rules plus consistent type imports. Prettier uses the root `prettier.config.js`.

## License

By contributing, you agree that your contributions are licensed under the Apache License 2.0.
