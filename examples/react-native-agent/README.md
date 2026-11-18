# React Native renovation agent

Offline home-renovation agent on the LarkX React Native runtime.

Two modes share the screen:

- **Test** uses `createScriptedModel`. `search_furniture` waits 8 seconds and can be cancelled. The tool calls are deterministic. This is the reliable interruption drill.
- **Device** uses `@larkx/cactus` and `CactusLM`. The model is `qwen3-0.6b` (SDK default `int8`). Tool calls come from `complete()`. They are not scripted. A small model can return an invalid call. That failure is stored as a tool step. The screen does not replace it with a successful plan.

Both modes use local room data, a local budget, a bundled furniture list, and `save_plan`. `save_plan` is idempotent and uses the step `operationId` as the plan id. Nothing in the tools contacts a server.

## Native build

Cactus 1.13.1 loads `react-native-nitro-modules`. Expo Go cannot load it. The M2 notes demo running in a dev build does not mean Expo Go supports this app.

This tree has not been installed on an emulator or a physical device. The steps below are the validation procedure, not a report of a run.

Requirements: Node.js 22.13 or newer, pnpm 10.33.4, a current Android SDK or Xcode, and a development build.

```bash
pnpm install
pnpm build
cd examples/react-native-agent
pnpm exec expo run:android
```

Use `expo run:ios` on a Mac. If Gradle reports `Activity not started` for the `larkx-agent://` URL, start Metro, reverse the port, and launch the activity directly:

```bash
adb reverse tcp:8081 tcp:8081
adb shell am start -n ai.larkx.agent.demo/.MainActivity
```

A full Metro reload (`r`) is required after changing the agent. Fast refresh keeps the registered workflow object.

## Model setup

Download and initialization are buttons. They are not steps in the agent run.

1. Stay online. Tap **Download**. The SDK reports progress. If the file is already present, `download()` is documented to return immediately with progress 1. That path has not been timed on a device here.
2. Tap **Initialize**. `init()` throws when the model is not downloaded.
3. Turn on airplane mode.
4. Tap **Device**, then **Start**.

The status line shows `cactus` and `getModelName()`, plus online or offline. The timeline is the stored steps. Labels sit next to keys such as `model-0` and `tool-0-0`. Session counters reset when the process dies. Attempt counts on the steps do not.

The published Cactus reference does not list a download size or a RAM minimum for `qwen3-0.6b`. Completions may include `ramUsageMb`. Treat a device with a few gigabytes of free memory as the practical target until you measure the download on that device. The adapter asks for 512 completion tokens. It does not set an undocumented context length.

## Techstars interruption

Use the device mode for the inference cut, and the test mode when you need the cut to land on a known tool.

1. Open the app with the model already downloaded and initialized.
2. Enable airplane mode. Confirm the status line says offline.
3. Choose **Device** and start: "Create a renovation plan for my living room with a $2,000 budget."
4. Wait until at least one model row and one tool row are `COMPLETED`.
5. Force-quit during a later `RUNNING` row. On Android, swipe the app away. Do not only press Home.
6. Reopen the app. The run id should return. The process is not still executing.
7. Tap **Recover**.
8. Completed model rows stay at attempt 1. Their handlers do not appear again in **This session**.
9. Completed tool rows stay at attempt 1. `save_plan` does not get a second operation id when it had already committed.
10. Let the run finish. The plan card reads the `save_plan` output.

Interrupted inference starts the model step over. It does not continue from the previous token. An interrupted non-idempotent tool would stay `BLOCKED` until reconciled. The renovation tools are `pure` or `idempotent`, so a kill during those tools retries the unfinished step and keeps its operation id.

The test mode makes step 5 repeatable: start **Test**, and force-quit while `search_furniture` is the running row. That wait is 8 seconds and observes cancellation. Recover, and the session list shows `search_furniture` once for the new attempt, not a second copy of the earlier tools.

## Reset

**Reset** deletes `larkx-agent.db` and the in-memory session list. It does not delete the Cactus model file.

## What the screen is not claiming

- The app does not keep running after the operating system kills it.
- Recovery continues from the last committed step.
- The scripted mode is not evidence that Cactus produced a plan.
- Airplane mode after a successful download is the offline path. The download itself needs whatever network Cactus uses to fetch the file.
