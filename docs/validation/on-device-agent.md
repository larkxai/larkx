# On-device agent validation

Physical-device checks for the React Native SDK. Automated tests do not complete this list. Mark a step only after it happens on a phone. Compiling the iOS bridge or the Android JNI library is not this list.

From the repository root:

```bash
pnpm install
pnpm --filter @larkxai/react-native build
pnpm --filter @larkxai/example-react-native-workflow exec expo prebuild
pnpm --filter @larkxai/example-react-native-workflow exec expo run:ios
pnpm --filter @larkxai/example-react-native-workflow exec expo run:android
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

Record the device, OS, and run id after a real run. Until that note exists, do not describe this checklist as completed.
