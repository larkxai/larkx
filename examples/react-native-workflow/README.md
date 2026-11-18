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
pnpm --filter @larkx/example-react-native-workflow start
```

Open the project in Expo Go on SDK 58, or in an Android or iOS emulator. This repository's CI does not launch either. A passing Node test suite is not a mobile run.

The screen shows the run id, status, current step, stored outputs, operation ids, the handlers invoked in this JavaScript session, and the latest history events.

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
4. Status becomes `COMPLETED`. The demo has no server call to fail.

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

Reset deletes `larkx.db` and the in-memory session list.

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
