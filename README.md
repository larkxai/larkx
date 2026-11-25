# LarkX

[![Build](https://github.com/larkxai/larkx/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/larkxai/larkx/actions/workflows/ci.yml)
[![Release](https://github.com/larkxai/larkx/actions/workflows/release.yml/badge.svg)](https://github.com/larkxai/larkx/actions/workflows/release.yml)
[![@larkxai/react-native](https://img.shields.io/npm/v/@larkxai/react-native?label=%40larkxai%2Freact-native)](https://www.npmjs.com/package/@larkxai/react-native)
[![Apache-2.0](https://img.shields.io/github/license/larkxai/larkx)](./LICENSE)

**Durable orchestration for on-device AI agents.**

LarkX persists an agent run on the device and recovers it after the process is killed. One C++ runtime owns that state machine. Node.js and React Native are host bindings. They do not contain a second execution engine.

Inference engines run models. LarkX runs agents.

[Website](https://larkx.ai) · [Roadmap](ROADMAP.md) · [React Native SDK](packages/react-native/README.md) · [Native core](native/README.md)

## Public API

React Native:

```typescript
import { createRuntime, defineTool, sqlite } from "@larkxai/react-native";

const runtime = await createRuntime({ storage: sqlite() });
const agent = runtime.createAgent({
  name: "personal-assistant",
  version: 1,
  model,
  instructions: "Help the user.",
  tools: [
    defineTool({
      name: "read_notes",
      description: "Read locally stored notes",
      schema: { type: "object", properties: {} },
      effects: "idempotent",
      handler: (_input, context) => ({ notes: ["Example note"], operationId: context.operationId }),
    }),
  ],
});
const run = await agent.start({ message: "Summarize my notes", runId: "assistant-1" });
const result = await run.result();
await runtime.close();
```

Node.js uses the same calls from `@larkxai/node`. Build the addon first with `sh packages/react-native/scripts/build-node-addon.sh`. Node.js 22.13 or newer is required.

The same surface covers the rest of a run:

| Area           | API                                                                                       |
| -------------- | ----------------------------------------------------------------------------------------- |
| Runtime        | `createRuntime`, `close`, `inspect`, `listRuns`, `diagnostics`                            |
| Agent          | `createAgent`, `start`                                                                    |
| Run            | `result`, `getStatus`, `getHistory`, `pause`, `resume`, `cancel`, `reconcile`, `schedule` |
| Tool           | `defineTool`, `ToolFailure`                                                               |
| Model          | any object with `complete`, or `scriptedModel` for tests                                  |
| Storage        | `sqlite`                                                                                  |
| Recovery       | `runtime.resume(runId)` after the process opens the same database                         |
| Reconciliation | `run.reconcile` when a non-idempotent step was interrupted                                |
| Observers      | `runtime.observe`                                                                         |

`@larkxai/cactus` is an optional model adapter. The C++ runtime does not import it. `@larkxai/host` is the shared TypeScript driver that submits model and tool results. Application code imports `@larkxai/node` or `@larkxai/react-native`.

Expo Go cannot load the native module. Use a development build.

## What the runtime guarantees

The C++ core plans the next action. The host does not choose step keys.

- A model decision and a tool result are durable once they are committed.
- A committed step is replayed. Its handler is not called again.
- An interrupted `pure` or `idempotent` step may run again. An idempotent retry keeps the same operation id.
- An interrupted `non-idempotent` step becomes an unknown outcome. The run is `BLOCKED` until `reconcile`.
- Ownership writes carry an epoch fence.
- Cancellation is explicit. A committed step stays committed.
- External effects are not exactly-once. The process can die after the effect and before the commit.

Open a new SQLite file. The runtime does not delete an existing application database and does not migrate a database written by the removed TypeScript engine. See [obsolete packages](docs/obsolete-packages.md).

## Examples

| Example                                                          | What it shows                                                      |
| ---------------------------------------------------------------- | ------------------------------------------------------------------ |
| [examples/node-agent](examples/node-agent/README.md)             | Scripted Node agent, process termination, and recovery             |
| [examples/react-native-workflow](examples/react-native-workflow) | React Native scripted agent, Cactus agent, and field inspection    |
| [examples/swift-agent](examples/swift-agent)                     | Minimal Swift host for the C ABI. It is not a production Swift SDK |

## Status

Implemented and covered by automated tests:

- One C++ agent runtime, shared by the Node addon and the React Native native module.
- Durable SQLite, replay of committed model and tool results, retries, cancellation, ownership fencing, unknown outcomes, and reconciliation.
- Real `SIGKILL` recovery through `examples/node-agent`.
- Cactus completion queue and cancellation in Node tests of the adapter.

Not done:

- A development build on a physical iPhone or Android phone, real Cactus inference, and force-quit recovery on that phone. Host compilation and `ctest` are not that validation. The checklist is [docs/validation/on-device-agent.md](docs/validation/on-device-agent.md).
- Native telemetry export. `@larkxai/telemetry` still builds metadata batches and can post them. Nothing in the C++ runtime feeds it a journal.
- Remote agent delegation, A2A, advanced privacy policies, and production Swift or Kotlin SDKs.

LarkX Cloud is optional. This repository does not implement it.

## Packages

| Package                 | Role                                                           |
| ----------------------- | -------------------------------------------------------------- |
| `@larkxai/protocol`     | Shared states, errors, and JSON encoding                       |
| `native/`               | C++ runtime. No React Native, Node, or model SDK dependency    |
| `@larkxai/host`         | Transport-agnostic driver                                      |
| `@larkxai/node`         | Node.js SDK                                                    |
| `@larkxai/react-native` | React Native SDK                                               |
| `@larkxai/cactus`       | Optional Cactus model adapter                                  |
| `@larkxai/telemetry`    | Optional metadata exporter. Not attached to the native journal |

## Develop

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

Node.js 22.13 or newer. pnpm 10.33.4. The breaking SDK change is recorded in `.changeset/cpp-only-runtime.md` and becomes 0.2.0 when Changesets versions the fixed group.
