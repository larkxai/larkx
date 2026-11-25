# @larkxai/react-native

```bash
npm install @larkxai/react-native
```

React Native adapter for the LarkX engine. It uses `@larkxai/core` and the SQLite schema in `@larkxai/storage-sqlite`. It does not implement a second execution engine.

## Driver

`expo-sqlite` synchronous API on Expo SDK 58. The driver runs `BEGIN IMMEDIATE` itself so a transaction matches the Node driver. OP-SQLite was not used: its transaction API is asynchronous and does not fit `SqliteDriver`.

The package does not add React Native imports to `@larkxai/core`.

## Engine

```typescript
import { bindReactNativeLifecycle, openReactNativeEngine } from "@larkxai/react-native";

const engine = openReactNativeEngine({
  database: "larkx.db",
  workflows: [notes],
});

bindReactNativeLifecycle(engine);
await engine.recover();
```

A second call for the same database name returns the engine already open in this JavaScript realm. `close()` drops that registration. A force-quit destroys the realm. The next launch may take unfinished runs because the previous owner is no longer live.

An expired lease does not, by itself, let another owner take a run while the original owner is still registered. See [Mobile lifecycle](../../docs/architecture/mobile-lifecycle.md).

## Artifacts

`engine.importArtifact({ sourceUri, artifactId, contentType })` copies bytes into the application document directory and inserts the artifact row only after the copy can be read back. The same id reuses that copy. Files are not uploaded and are not deleted automatically.

## Hooks

`useLarkxRun(engine, runId)` subscribes for display. It does not own the run.

`readJournal` is forwarded from the shared engine. `createExpoSqliteDriver` opens a second database for exporter state. Cloud sync itself is `@larkxai/telemetry`, not this package. Call `setActive(false)` when the app leaves the foreground. The adapter does not schedule native background uploads.

## Native C++ runtime (preview)

Import this from `@larkxai/react-native/native`. It does not replace the exports above.

```typescript
import { createRuntime, defineTool, scriptedModel, sqlite } from "@larkxai/react-native/native";

const runtime = await createRuntime({ storage: sqlite() });
const agent = runtime.createAgent({
  name: "personal-assistant",
  version: 1,
  model: scriptedModel([
    {
      message: null,
      finish: "tool_calls",
      calls: [{ id: "call-1", name: "read_notes", arguments: {} }],
    },
    { message: "Summary: Example note", finish: "stop", calls: [] },
  ]),
  instructions: "Help the user manage daily tasks.",
  tools: [
    defineTool({
      name: "read_notes",
      description: "Read locally stored notes",
      schema: { type: "object", properties: {} },
      effects: "pure",
      handler: async () => ({ notes: ["Example note"] }),
    }),
  ],
});
const run = await agent.start({ message: "Summarize my notes" });
const result = await run.result();
await runtime.close();
```

`sqlite()` with no path uses the application document directory. The C++ core opens that file. Execution state, model decisions, and tool results stay in that SQLite database. The TypeScript file drives `larkx_run_drive`: it performs the requested model or tool call and submits the result. It does not choose the next step.

`agent.start({ message, runId })` persists the run and then schedules the one host driver for that run id. The stored run is `RUNNING`. `run.result()` waits for the terminal result. It does not start execution. Pass `defer: true` to persist without scheduling, then call `run.schedule()`. `runtime.resume(runId)` schedules recovery unless `{ defer: true }` is set. A `WAITING` run stays paused until `run.resume()`. A second `result()`, `start` with the same message, or `resume` for that id uses the same driver. A second `start` with a different message is rejected and does not start another driver. `runtime.listRuns()` reads persisted runs from the C++ store. `larkx_run_count` and `larkx_run_at` are separate snapshots ordered by `updated_at` then `run_id`, so the list can skip a run that changes between the calls. Inspect the run you recover. A committed model decision records its provider and model name. Continuing that run with a different registered model fails and leaves the stored run in place. `runtime.observe(listener)` is for diagnostics: the driver does not wait, and a throw or rejection does not fail the run. `runtime.holdExecution(listener)` is a development barrier. The driver waits for it, and a throw or rejection still does not fail the run.

Register the agent again and await `agent.whenRegistered()` before `runtime.resume(runId)`. `run.pause()`, `run.resume()`, and `run.cancel()` are the run controls. `run.getStatus()` and `run.getHistory()` read the stored run. `bindNativeAppState(runtime, AppState)` waits for the foreground before starting a model or tool call. Backgrounding does not close the runtime and does not release ownership. A killed process leaves the database. The next launch with the same owner continues from the committed steps.

This needs a development build. Expo Go does not load the module. If `LarkXNativeCore` is missing, `createRuntime` throws and does not open the TypeScript engine.

The screen in `examples/react-native-workflow` has a Native C++ card. It prints the backend, ABI, protocol, schema, run id, status, model and tool counts, and operation ids, then closes and reopens the same run. That card was not executed on a simulator or a device in CI.

### Install and test

From the repository:

```bash
pnpm install
pnpm --filter @larkxai/react-native build
sh packages/react-native/scripts/build-node-addon.sh
pnpm exec vitest run tests/react-native/native-core.test.ts
```

The addon links the shared core and system `libsqlite3`. Set `NODE_INCLUDE` to the Node headers when `node_api.h` is not beside the Node binary. `LARKX_NATIVE_ADDON` overrides the addon path.

iOS: `LarkXNativeCore.podspec` compiles the core sources and links the Apple SDK `libsqlite3`. Expo autolinking finds that podspec. The bridge uses the same UTF-16 codec as Android, so an embedded NUL is not truncated and ill-formed sequences become U+FFFD. From the repository root, `pnpm --filter @larkxai/example-react-native-workflow exec expo prebuild` then `pnpm --filter @larkxai/example-react-native-workflow exec expo run:ios` produces the development build. `packages/react-native/ios/ci-compile.sh` compiles the bridge on macOS. It does not boot a simulator.

Android: `packages/react-native/android` builds `liblarkxnative.so` from the library Gradle project. `react-native.config.js` names `LarkXNativePackage`, which Expo autolinking imports. The package has no codegen `libraryName`, so the app's new-architecture CMake build does not add a second copy of this library. The NDK has no SQLite, so the build downloads SQLite amalgamation 3450100 and checks SHA-256 `5592243caf28b2cdef41e6ab58d25d653dfc53deded8450eb66072c929f030c4`. JNI converts Java UTF-16 to standard UTF-8 before the core sees it, and converts the core's UTF-8 back to UTF-16. `GetStringUTFChars` and `NewStringUTF` are not used. `pnpm --filter @larkxai/example-react-native-workflow exec expo run:android` after `expo prebuild` is the development build. The CI job compiles the `.so`. It does not compile the React Native Gradle app and it does not boot an emulator.

`invalidate()` drops the Java handle under a lock and asks the native registry to destroy the session. That destroy waits until `invoke` calls on other threads have returned, so the session is not freed underneath them. A handle used after that returns `INVALID_ARGUMENT`.

`pnpm pack` vendors `native/abi`, `native/core/include`, and `native/core/src` into the package. The git tree keeps those sources under `native/`. The pod and the Android CMake file use the vendored copy when it is present and the monorepo `native/` directory otherwise.

## What this package does not do

- Native background scheduling.
- Cloud dispatch.
- Encrypted storage.
- A promise that a suspended app keeps executing.

Node tests cover the ownership policy with `node:sqlite`. They do not open Expo's native SQLite module.
