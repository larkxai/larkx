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

| Package                 | Role                                     |
| ----------------------- | ---------------------------------------- |
| `@larkx/protocol`       | Contracts. No runtime dependency         |
| `@larkx/core`           | Durable workflow engine                  |
| `@larkx/storage-memory` | In-memory adapter for tests              |
| `@larkx/storage-sqlite` | Schema, migrations, shared SQL behavior  |
| `@larkx/node`           | Node driver and `createNodeEngine`       |
| `@larkx/react-native`   | Expo SQLite adapter and mobile lifecycle |
| `@larkx/agent`          | Durable agent loop                       |
| `@larkx/cactus`         | Optional Cactus model adapter            |
| `@larkx/telemetry`      | Optional metadata-only Cloud exporter    |
| `@larkx/testing`        | Clocks and conformance helpers           |

Packages under `packages/` are the public SDK. The root package and everything in `examples/` are private.

## Pull requests

- Explain which guarantee the change protects or which limitation it removes.
- Show the commands you ran. If a crash or storage test did not run, say so.
- Do not claim device, emulator, or provider coverage that the diff does not exercise.
- Do not add a registry token, an `.npmrc` auth line, or a second publish workflow.

## Publishing

Library packages publish together to the public npm registry as `@larkx/*`. Changesets is configured with `access: public` and a fixed version group. Add a changeset for a user-visible package change. A push to `main` that still has changesets opens a "Version packages" pull request. Merging that pull request publishes every library package at the new version.

The job is `release` in [`.github/workflows/ci.yml`](.github/workflows/ci.yml). It runs only after `check` succeeds on `main`. It builds `dist`, then runs `changeset publish`. npm provenance is requested from GitHub Actions. The root package stays private because the unscoped name `larkx` belongs to an unrelated project.

Before the first publish:

1. On npm, create the `larkx` organization with the account that should own the scope, or confirm that account already owns `@larkx`.
2. Create an access token that can publish new and existing packages in that scope. Automation cannot complete a 2FA prompt, so the token has to be allowed to publish without an interactive prompt.
3. Store the token as the Actions secret `NPM_TOKEN` in `larkxai/larkx`. Do not commit it.
4. In the repository's Actions settings, allow GitHub Actions to create pull requests. The version pull request needs that.

`pnpm version-packages` is what the workflow runs to bump versions, refresh the lockfile, and copy the `@larkx/telemetry` version into `SDK_VERSION`. `pnpm release` builds and publishes. Use those from a laptop only to recover a failed release.

## Code style

TypeScript is strict, including `exactOptionalPropertyTypes` and `noUncheckedIndexedAccess`. ESLint uses type-aware-free recommended rules plus consistent type imports. Prettier uses the root `prettier.config.js`.

Workflow and step identifiers are validated. Do not derive step identity from line numbers.

## License

By contributing, you agree that your contributions are licensed under the Apache License 2.0.
