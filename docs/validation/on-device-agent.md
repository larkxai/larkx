# On-device agent validation

Physical-device checks for the React Native SDK. Automated tests do not complete this list. Mark a step only after it happens on a phone. Compiling the iOS bridge or the Android JNI library is not this list.

From the repository root:

```bash
pnpm install
pnpm --filter @larkxai/react-native build
pnpm --filter @larkxai/example-react-native-agent exec expo prebuild
pnpm --filter @larkxai/example-react-native-agent exec expo run:ios
pnpm --filter @larkxai/example-react-native-agent exec expo run:android
```

`expo prebuild` and `expo run:ios` / `expo run:android` have not been run in this repository's CI. Expo Go cannot load `LarkXNativeCore` or Cactus.

The field screen uses `larkx-field.db` for runs and `larkx-field-data.db` for tool effects. Runs are discovered with `runtime.listRuns()`. Refresh that snapshot before recovering if other work is in flight. Scripted runs are `field-assistant-scripted` version 1. Local runs are `field-assistant-local` version 1. Recover a run in the matching mode.

## Install the local model

1. Open Field inspection and choose Local model.
2. Press Prepare model. The status shows download progress, then initialization.
3. Confirm the status says tool calling and cancellation are supported.
4. Leave the screen. The card calls `destroy()`. This repository has not executed download, init, or destroy on a device.

## Scripted timeline

1. Choose Scripted and press Start.
2. Confirm the timeline shows model requests, tool requests, commits, and completion.
3. Confirm the diagnostics line says the execution backend is the native C++ runtime and includes the ABI and run id.

## Offline

1. Prepare the model while online, then enable airplane mode.
2. Force-quit and relaunch.
3. Start a new local-model run. It must finish with local tools and the on-device model.

## Termination

1. Start a scripted run and force-quit after a tool has committed.
2. Reopen the app and resume that run. The committed tool must not run again.
3. Start a run whose tool is non-idempotent and force-quit inside the handler.
4. Resume. The run stays blocked until reconcile. The handler must not run again on its own.

## Remote procurement fixture

These steps have not been run on a phone.

1. Start `examples/remote-task` on a computer and note that computer's LAN address. Bind is all interfaces. Confirm `GET http://<lan-address>:8787/_tasks` from another machine on the same network.
2. On the phone, open Field inspection, set the endpoint to `http://<lan-address>:8787`, and leave Network available selected. Do not enter `localhost` or `127.0.0.1`. Those names are the phone.
3. Start a scripted run. The timeline should show a hybrid step, a client operation id, and a different remote task id. The saved report should mention the simulated supplier.
4. Start again, mark the network unavailable, and confirm the timeline says it is waiting for the network. Mark the network available and confirm the same operation continues.
5. After the timeline shows an accepted task id, force-quit the app. Confirm the fixture still has that task. Relaunch, recover the run, and confirm the local agent continues without a second task.
6. Cancel a run after acceptance. If the fixture supports cancel, its task becomes cancelled. The screen must not claim that a remote effect was rolled back.

Record the device, OS, and run id after a real run. Until that note exists, do not describe this checklist as completed.
