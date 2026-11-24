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

## What this package does not do

- Native background scheduling.
- Cloud dispatch.
- Encrypted storage.
- A promise that a suspended app keeps executing.

Node tests cover the ownership policy with `node:sqlite`. They do not open Expo's native SQLite module.
