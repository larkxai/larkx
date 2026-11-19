# Field Assistant

Offline inspection assistant for a phone. It uses the existing Larkx agent, the Cactus adapter, SQLite, and the Cloud telemetry exporter. It does not add another execution engine.

The screen is a chat. The model reads bundled inspection notes, a maintenance checklist, and equipment history through registered tools, then saves a report on the device. Cloud receives the journal metadata. It does not receive the notes, the prompt, or the report, and it does not run the agent.

The records are illustrative. The report is not a certified safety assessment.

## Modes

Device mode calls Cactus. The default model is `qwen3-0.6b`. Set `EXPO_PUBLIC_LARKX_CACTUS_MODEL` before Metro starts to request another Cactus slug. Qwen3-0.6B sometimes writes a tool call as text instead of a native function call. This example accepts a JSON object in that text when its `name` is one of the four tools. It does not invent a tool the model did not name.

Scripted test mode is labeled in the setup screen and in Developer details. It replays a fixed tool order for tests and for a repeatable interruption. It does not run Cactus.

## Run it

Requirements: Node.js 22.13 or newer, pnpm 10.33.4, and Xcode or the Android SDK. Expo Go cannot load Cactus. Use a development build.

React Native 0.88 needs the Nitro patch already in this repository. `pnpm install` applies it. A Metro reload does not recompile that native file.

```bash
pnpm install
pnpm --filter @larkx/telemetry build
cd examples/field-inspection-agent
pnpm exec expo run:ios --device
```

Use `expo run:android` for a phone whose ABI includes the Cactus library (`arm64-v8a`). An Intel Mac simulator cannot load the current Cactus iOS binaries.

On first launch, tap **Download**, then **Initialize**. After that, a cold start calls `init()` again. The model file stays on the phone.

Optional Cloud, in the shell that starts Metro:

```bash
export EXPO_PUBLIC_LARKX_CLOUD_ENDPOINT=https://cloud.larkx.ai
export EXPO_PUBLIC_LARKX_INGESTION_KEY=lkx_ing_...
export EXPO_PUBLIC_LARKX_CLOUD_DASHBOARD='https://cloud.example/runs/{runId}'
```

Leave the endpoint or the key empty and the footer stays **Disabled**. The dashboard variable is optional. **View run in Cloud** appears only when it contains `{runId}`. There is no invented dashboard link.

Optional interruption window, also before Metro starts:

```bash
export EXPO_PUBLIC_LARKX_DEMO_DELAY_MS=8000
```

That waits inside `get_equipment_history` and observes cancellation. Leave it unset for the normal app. Report generation is the natural window: force-quit while **Generate report** says Running.

## What to tap

1. Send `Review today's inspection notes, identify priority maintenance issues, and create a report.`
2. The activity card follows persisted steps. A row stays Pending until that step commits. After the run finishes, a step the model never called says Skipped. Every row is LOCAL. Cloud sync does not turn a step into CLOUD execution.
3. The report lists only notes from the bundle. Severity comes from the checklist for that note, not from a severity word the model typed.
4. Turn on airplane mode. Local tools and inference still run. The cloud pill says Offline.
5. Force-quit while a row says Running. Swipe the app away. Pressing Home leaves it in the background.
6. Open the app again. The same run returns. The banner says execution recovered, with the restored step count, the repeated step count, and the recovery count taken from the journal. Completed steps stay on attempt 1.
7. Restore the network. The pill moves to Sync pending, then Synced. Open that run id in LarkX Cloud. The journal should include `WORKFLOW_RECOVERED` and should not include the prompt or the report text.

Developer details shows the run id, step keys, attempts, operation ids, handlers invoked in this process, and sync state. Reset clears the conversation databases and leaves the downloaded model in place. A force-quit clears the in-memory handler list. That list is not the durable attempt count.

## Recording

About a minute on a phone:

1. Send the inspection prompt and show the local steps.
2. If Cloud is configured, show the run id.
3. Enable airplane mode.
4. Force-quit during an unfinished step.
5. Reopen. Show the recovered conversation and the preserved steps.
6. Let the report finish offline.
7. Restore the network, then open the same run in LarkX Cloud.

Closing line: "AI agents. Beyond the cloud."

## Tests

`tests/field-inspection/agent.test.ts` runs the scripted agent, checks that a committed tool is not called again after recovery, checks the text tool-call parser, and checks that pending rows are not marked completed.

## Limitations

This environment did not install the app on a phone and did not record the demo. The React Native renovation example is the device path that already ran Cactus and uploaded a journal. This bundle id is `ai.larkx.field.demo`, so it needs its own `expo run:ios --device` build.

Cloud batches are metadata. They include step keys, statuses, attempts, and operation ids. They do not include tool names, prompts, notes, model text, or the report. A LOCAL badge means the step ran on the device. Uploading the journal does not make the step a CLOUD execution.

Force-quit stops the process. The agent does not keep inferring while the app is gone, and a model call does not resume mid-token. Reopen continues from the last committed step. A completed step stays on its first attempt.

`EXPO_PUBLIC_LARKX_DEMO_DELAY_MS` is off unless you set it. A larger Cactus model was not measured here. Set `EXPO_PUBLIC_LARKX_CACTUS_MODEL` only if you already know that slug works on the phone.
