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
- Do not import Node, React Native, or a database driver from `@larkxai/protocol`, `@larkxai/core`, `@larkxai/storage-memory`, or `@larkxai/storage-sqlite`.
- Do not add a model provider dependency to the core.
- State-machine changes start in `@larkxai/protocol` and must be applied by the shared reducer.
- Crash-recovery changes need a `SIGKILL` test when they affect what survives process death.

## Packages

| Package                   | Role                                     |
| ------------------------- | ---------------------------------------- |
| `@larkxai/protocol`       | Contracts. No runtime dependency         |
| `@larkxai/core`           | Durable workflow engine                  |
| `@larkxai/storage-memory` | In-memory adapter for tests              |
| `@larkxai/storage-sqlite` | Schema, migrations, shared SQL behavior  |
| `@larkxai/node`           | Node driver and `createNodeEngine`       |
| `@larkxai/react-native`   | Expo SQLite adapter and mobile lifecycle |
| `@larkxai/agent`          | Durable agent loop                       |
| `@larkxai/cactus`         | Optional Cactus model adapter            |
| `@larkxai/telemetry`      | Optional metadata-only Cloud exporter    |
| `@larkxai/testing`        | Clocks and conformance helpers           |

Packages under `packages/` are the public SDK. The root package and everything in `examples/` are private.

## Pull requests

- Explain which guarantee the change protects or which limitation it removes.
- Show the commands you ran. If a crash or storage test did not run, say so.
- Do not claim device, emulator, or provider coverage that the diff does not exercise.
- Do not add a registry token, an `.npmrc` auth line, or a second publish workflow.

## Publishing

Library packages in this repository publish together to npm as `@larkxai/*`. Changesets is configured with `access: public` and a fixed version group. Add a changeset for a user-visible package change. On the `0.1` line, mark it `patch`: the next release is `0.1.1`, then `0.1.2`. A `minor` changeset moves the whole group to `0.2.0`. A push to `main` that still has changesets opens a "Version packages" pull request. Merging that pull request publishes every library package at the new version.

The job is `release` in [`.github/workflows/ci.yml`](.github/workflows/ci.yml). It runs only after `check` succeeds on `main`. It builds `dist`, then runs `changeset publish`. npm provenance is requested from GitHub Actions. The root package stays private because the unscoped name `larkx` belongs to an unrelated project.

The same npm scope is shared across the LarkX repositories. One token covers every current and future `@larkxai` package. Android and iOS do not use it.

| Repository             | Distribution          | Package                                                                 |
| ---------------------- | --------------------- | ----------------------------------------------------------------------- |
| `larkxai/larkx`        | npm                   | `@larkxai/core`, `@larkxai/node`, and the other packages in `packages/` |
| `larkxai/react-native` | npm                   | `@larkxai/react-native`                                                 |
| `larkxai/android`      | Maven Central         | `ai.larkx:core`                                                         |
| `larkxai/ios`          | Swift Package Manager | `LarkX`                                                                 |

`@larkxai/react-native` still lives in this repository, so this release publishes it. When `larkxai/react-native` is created, remove it from this repository's publish set before that repository publishes the same name. `larkxai/android` and `larkxai/ios` are not in this tree.

Store the token once as a GitHub organization secret:

1. On npm, the organization that owns the scope is `larkxai`. A token from that organization can publish every `@larkxai` package. The token has to be allowed to publish without an interactive 2FA prompt.
2. In the `larkxai` GitHub organization, create an Actions secret named `NPM_TOKEN`. Grant it to `larkx` and, when that repository exists, `react-native`. A repository secret with the same name also works. Do not commit the token, and do not create a separate token per repository.
3. Allow GitHub Actions to create pull requests. The version pull request needs that.

The release job already has `id-token: write`. After the packages exist, npm trusted publishing can replace `NPM_TOKEN`. Leave the token in place until each package has a trusted publisher for this workflow.

`pnpm version-packages` is what the workflow runs to bump versions, refresh the lockfile, and copy the `@larkxai/telemetry` version into `SDK_VERSION`. `pnpm release` builds and publishes. Use those from a laptop only to recover a failed release.

## Code style

TypeScript is strict, including `exactOptionalPropertyTypes` and `noUncheckedIndexedAccess`. ESLint uses type-aware-free recommended rules plus consistent type imports. Prettier uses the root `prettier.config.js`.

Workflow and step identifiers are validated. Do not derive step identity from line numbers.

## License

By contributing, you agree that your contributions are licensed under the Apache License 2.0.
