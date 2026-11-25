# React Native workflow

A local Expo demo of the LarkX engine. The handlers are deterministic and do not call a network API. No model is required.

The demo has two workflows:

- **Notes** — `intake` (8 seconds), `count` (8 seconds), `pause` (15 seconds), and idempotent `record` (8 seconds).
- **Charge** — one non-idempotent `charge` step that waits 15 seconds.

`pause` and `charge` are the steps to interrupt.

## Run

From the repository root:

```bash
pnpm install
pnpm build
pnpm --filter @larkxai/example-react-native-workflow start
```

Open the project in Expo Go on SDK 58, or in an Android or iOS emulator. This repository's CI does not launch either. A passing Node test suite is not a mobile run.

The screen shows the run id, status, current step, stored outputs, operation ids, the handlers invoked in this JavaScript session, and the latest history events.

The lower card, Native C++ core, is separate. It drives a scripted agent through `@larkxai/react-native/native`. `start` persists the run. `result` runs the model and tools. Expo Go cannot load that module. Use a development build:

```bash
cd examples/react-native-workflow
npx expo prebuild
npx expo run:ios
npx expo run:android
```

Autolinking picks up `LarkXNativeCore.podspec` and `LarkXNativePackage`. The card prints `Execution backend: Native C++`, the ABI, the run id, and the operation ids, then closes and reopens the same run. A missing module shows the error and does not run the TypeScript engine. This repository has not executed that card on a simulator or a device.

Cloud sync is optional. Set `EXPO_PUBLIC_LARKX_CLOUD_ENDPOINT` and `EXPO_PUBLIC_LARKX_INGESTION_KEY` to show Connected, Offline, Pending synchronization, or Authentication error, plus the run id and a Sync action. Without those variables the card stays Disabled and no request is sent. The key is not in this repository. Reset deletes `larkx.db` and `larkx-workflow-telemetry.db` together.

## Manual checks

### A. Force-quit during pause

1. Choose Notes and press Start.
2. Wait until intake and count show completed outputs.
3. Force-quit while pause is running.
4. Reopen the app.
5. The stored outputs for intake and count are still there.
6. The session invocation list does not contain those two steps until pause runs again. Pause may run again. Record runs after it.

### B. Airplane mode

1. Enable airplane mode.
2. Press Start on a new Notes run.
3. Let it finish.
4. Status becomes `COMPLETED`. Local steps do not wait on Cloud. With no ingestion key configured, the demo sends no request.

### C. Suspend past the lease

1. Press Start.
2. Background the app and leave it longer than 30 seconds.
3. Open the app.
4. The session invocation list does not grow a second copy of a step that was already running. One owner keeps the run. The epoch is not given to a second engine in the same runtime.

### D. Idempotent operation id

1. Press Start on Notes.
2. Force-quit during `record`, after pause has completed.
3. Reopen.
4. The operation id shown for `record` is the same one from before the quit. The handler can run again. The id does not.

### E. Uncertain charge

1. Choose Charge and press Start.
2. Force-quit during the charge step.
3. Reopen.
4. The run is `BLOCKED`. Charge is not called again.
5. Press Reconcile only after you know the effect did not happen. That retries the same operation id.

Reset deletes `larkx.db`, `larkx-workflow-telemetry.db`, and the in-memory session list.

## Automated coverage

Node tests in `tests/react-native` cover exclusive ownership, foreground recovery, artifact reuse, the shared SQLite conformance cases, and `SIGKILL` of a process that uses the mobile storage policy. Those processes use `node:sqlite`, not Expo's native module.

| Check                                             | Automated on Node              | Emulator | Device  |
| ------------------------------------------------- | ------------------------------ | -------- | ------- |
| A. Skip committed steps after process death       | Yes, via `SIGKILL`             | Not run  | Not run |
| B. Finish with the network reported offline       | Yes, for the lifecycle binding | Not run  | Not run |
| C. Expired lease does not steal from a live owner | Yes                            | Not run  | Not run |
| D. Stable idempotent operation id                 | Yes, via `SIGKILL`             | Not run  | Not run |
| E. Non-idempotent interrupt stays blocked         | Yes, via `SIGKILL`             | Not run  | Not run |
| Expo SQLite and the demo UI                       | No                             | Not run  | Not run |
| Native C++ scripted agent                         | Yes, through the Node addon    | Not run  | Not run |
