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
- Do not publish `@larkxai/node`, `@larkxai/host`, `@larkxai/protocol`, `@larkxai/cactus`, or `@larkxai/telemetry`. They are private workspace packages. `@larkxai/react-native` is the public npm SDK and bundles the JavaScript it needs.
- Do not import Node, React Native, a database driver, or a model provider from `@larkxai/protocol`, `@larkxai/host`, or `@larkxai/telemetry`.
- Do not add a model provider dependency to `native/`.
- State-machine changes start in the C++ reducer and the protocol tables together.
- Crash-recovery changes need a `SIGKILL` test when they affect what survives process death.
- Do not restore the TypeScript workflow engine.
- Do not commit `packages/node/native/vendor` or `packages/react-native/vendor`. Packaging copies those trees at pack time.

## Packages

| Package                 | Role                                                                |
| ----------------------- | ------------------------------------------------------------------- |
| `@larkxai/react-native` | Public npm SDK, including the optional `./cactus` subpath           |
| `@larkxai/node`         | Private Node host. Source-built native addon for tests and examples |
| `@larkxai/host`         | Private driver. Submits the model or tool result the core requested |
| `@larkxai/protocol`     | Private contracts and canonical JSON                                |
| `@larkxai/cactus`       | Private Cactus adapter used by the React Native subpath             |
| `@larkxai/telemetry`    | Private metadata exporter. Not attached to the native journal       |

The root package and everything in `examples/` are private. Packages that are no longer published are listed in [docs/obsolete-packages.md](docs/obsolete-packages.md).

## Pull requests

- Explain which guarantee the change protects or which limitation it removes.
- If the change is visible in `@larkxai/react-native`, update the public page under `docs/` in the same pull request. Use `{{sdkVersion}}` instead of typing the version. `pnpm version-packages` refreshes `docs/docs.json`.
- Show the commands you ran. If a crash or native test did not run, say so.
- Do not claim device, emulator, or provider coverage that the diff does not exercise.
- Do not add a registry token, an `.npmrc` auth line, or a second publish workflow.

## Node.js development host

Node.js is how this repository tests mobile execution semantics without building an application. It is not a public SDK. Do not add it back to the npm release, the public install instructions, or the Changesets version group.

The internal host compiles its addon from the C++ sources:

```bash
sh packages/node/scripts/build-native.sh
```

That build needs Node.js 22.13 or newer, CMake 3.20 or newer, a C++20 compiler, SQLite 3 development headers, and Node.js headers (`node_api.h`). It covers Linux x64 and macOS arm64/x64. Prebuilt binaries are not published. Windows is not supported. `tests/release/node-install.test.ts` packs the private package, installs that tarball outside the repo, and builds the addon there. That test checks the internal artifact. It is not an instruction to publish `@larkxai/node`.

`examples/node-agent` is the `SIGKILL` demo. `examples/node-hybrid` and `examples/remote-task` exercise durable delegation. Keep those tests.

## Publishing

`@larkxai/react-native` is the only package this repository publishes. Changesets uses `access: public` and `privatePackages.version: false`. There is no fixed group. Add a changeset for a user-visible React Native change. A push to `main` that still has changesets opens a Version packages pull request. Merging that pull request publishes `@larkxai/react-native`.

[`.github/workflows/ci.yml`](.github/workflows/ci.yml) is the build status. [`.github/workflows/release.yml`](.github/workflows/release.yml) runs after that build succeeds on `main`. It builds `dist`, publishes to npm, publishes the same version to GitHub Packages, and opens a GitHub Release. The root package stays private because the unscoped name `larkx` belongs to an unrelated project. Versions of `@larkxai/node` that are already on npm stay there. This repository does not publish a newer Node package.

One npm token covers the `@larkxai` scope. Do not commit it. Store it as the `NPM_TOKEN` Actions secret. `pnpm version-packages` bumps `@larkxai/react-native`, refreshes the lockfile, and copies that version into `SDK_VERSION`.

## Code style

TypeScript is strict, including `exactOptionalPropertyTypes` and `noUncheckedIndexedAccess`. ESLint uses recommended rules plus consistent type imports. Prettier uses the root `prettier.config.js`.

## License

By contributing, you agree that your contributions are licensed under the Apache License 2.0.
