# Contributing

LarkX is Apache-2.0. Keep the C++ execution engine correct before adding surface area.

## Setup

- Node.js 22.13 or newer.
- pnpm 10.33.4. The `packageManager` field is the source of truth.
- CMake 3.20 or newer, a C++20 compiler, and SQLite 3 headers for the native tests and the Node addon.

```bash
pnpm install
pnpm build
pnpm typecheck
pnpm lint
pnpm format
pnpm test
sh packages/node/scripts/build-native.sh
sh packages/react-native/scripts/build-host-tests.sh
```

`pnpm test` rebuilds packages and runs Vitest. Tests import the public entry points in `dist/`. Build the Node addon before the native host tests. CI installs CMake and g++ before those steps.

## Scope of a change

Read [AGENTS.md](AGENTS.md) before editing the runtime.

- Do not add an empty package and describe it as available.
- Do not publish `@larkxai/host`, `@larkxai/protocol`, `@larkxai/cactus`, or `@larkxai/telemetry`. They are private workspace modules. The public SDKs bundle the JavaScript they need.
- Do not import Node, React Native, a database driver, or a model provider from `@larkxai/protocol`, `@larkxai/host`, or `@larkxai/telemetry`.
- Do not add a model provider dependency to `native/`.
- State-machine changes start in the C++ reducer and the protocol tables together.
- Crash-recovery changes need a `SIGKILL` test when they affect what survives process death.
- Do not restore the TypeScript workflow engine.
- Do not commit `packages/node/native/vendor` or `packages/react-native/vendor`. Packaging copies those trees at pack time.

## Packages

| Package                 | Role                                                                |
| ----------------------- | ------------------------------------------------------------------- |
| `@larkxai/node`         | Public Node SDK. Source-built native addon                          |
| `@larkxai/react-native` | Public React Native SDK, including the optional `./cactus` subpath  |
| `@larkxai/host`         | Private driver. Submits the model or tool result the core requested |
| `@larkxai/protocol`     | Private contracts and canonical JSON                                |
| `@larkxai/cactus`       | Private Cactus adapter used by the React Native subpath             |
| `@larkxai/telemetry`    | Private metadata exporter. Not attached to the native journal       |

The root package and everything in `examples/` are private. Packages that are no longer published are listed in [docs/obsolete-packages.md](docs/obsolete-packages.md).

## Pull requests

- Explain which guarantee the change protects or which limitation it removes.
- Show the commands you ran. If a crash or native test did not run, say so.
- Do not claim device, emulator, or provider coverage that the diff does not exercise.
- Do not add a registry token, an `.npmrc` auth line, or a second publish workflow.

## Publishing

`@larkxai/node` and `@larkxai/react-native` publish together. Changesets uses a fixed group of those two packages, `access: public`, and `privatePackages.version: false`. Add a changeset for a user-visible SDK change. The pending changeset is a minor bump from 0.1.2, which versions both SDKs as 0.2.0. A push to `main` that still has changesets opens a Version packages pull request. Merging that pull request publishes the two SDKs.

[`.github/workflows/ci.yml`](.github/workflows/ci.yml) is the build status. [`.github/workflows/release.yml`](.github/workflows/release.yml) runs after that build succeeds on `main`. It builds `dist`, publishes to npm, publishes the same versions to GitHub Packages, and opens a GitHub Release for each public package. The root package stays private because the unscoped name `larkx` belongs to an unrelated project.

One npm token covers the `@larkxai` scope. Do not commit it. Store it as the `NPM_TOKEN` Actions secret. `pnpm version-packages` bumps the public SDKs, refreshes the lockfile, and copies the `@larkxai/node` version into `SDK_VERSION`.

## Code style

TypeScript is strict, including `exactOptionalPropertyTypes` and `noUncheckedIndexedAccess`. ESLint uses recommended rules plus consistent type imports. Prettier uses the root `prettier.config.js`.

## License

By contributing, you agree that your contributions are licensed under the Apache License 2.0.
