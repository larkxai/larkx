# Field Assistant

A phone workflow for inspection notes. You type what you saw. Four local model stages run in a fixed order. Each stage receives the committed output of the previous stage.

1. Extract issues from the notes.
2. Classify those issues with the bundled maintenance rules.
3. Write follow-up actions.
4. Write the inspection report.

The rules are a rubric, not a set of notes. The notes come from the message you send. Device mode calls Cactus for every stage. Scripted test mode is labeled and does not call Cactus. It still reads the text you entered.

Cloud receives journal metadata only. It does not receive the notes, the stage text, or the report, and it does not run the stages. A proposal for an opt-in input and output trace is in `docs/cloud-io-tracing-proposal.md`.

The report is an illustrative maintenance summary, not a certified safety assessment.

## Run it

Requirements: Node.js 22.13 or newer, pnpm 10.33.4, and Xcode or the Android SDK. Expo Go cannot load Cactus. Use a development build. This bundle id is `ai.larkx.field.demo`.

```bash
pnpm install
pnpm --filter @larkxai/telemetry build
cd examples/field-inspection-agent
pnpm exec expo run:ios --device
```

An Intel Mac simulator cannot load the current Cactus iOS binaries.

On first launch, tap **Download**, then **Initialize**. After that, a cold start calls `init()` again.

Optional Cloud, in the shell that starts Metro:

```bash
export EXPO_PUBLIC_LARKX_CLOUD_ENDPOINT=https://cloud.larkx.ai
export EXPO_PUBLIC_LARKX_INGESTION_KEY=lkx_ing_...
export EXPO_PUBLIC_LARKX_CLOUD_DASHBOARD='https://cloud.example/runs/{runId}'
```

Leave the endpoint or the key empty and the footer stays **Disabled**. **View run in Cloud** appears only when the dashboard value contains `{runId}`.

Optional pause before the planning stage calls the model:

```bash
export EXPO_PUBLIC_LARKX_DEMO_DELAY_MS=8000
```

Leave it unset for the normal app. Report generation is the natural interruption window.

`EXPO_PUBLIC_LARKX_CACTUS_MODEL` selects another Cactus slug. The default is `qwen3-0.6b`. Each stage uses a short prompt so that model has one job.

## What to tap

1. Enter notes, or tap the example sentence. One message is enough. It can include the request to create a report.
2. The card shows Extract, Classify, Create action plan, and Generate report. A stage stays Waiting until it starts. Its detail line comes from the committed output. Every stage is LOCAL.
3. Turn on airplane mode. The stages still run. The footer says Working offline.
4. Force-quit while a stage says it is running. Swipe the app away. Pressing Home leaves it in the background.
5. Open the app again. The same run returns. Completed stages keep their output and are not called again. The banner says the workflow resumed from its last saved checkpoint.
6. Restore the network. The footer moves through Sync pending to Synced. The Cloud page for that run id shows the stage keys, attempts, and `WORKFLOW_RECOVERED`. It does not show the notes or the report.

Developer details shows the run id, `inspection-workflow` v1, step keys, attempts, and operation ids. Reset clears the conversation databases and leaves the model file in place.

For a full report without waiting on Cactus, tap **Scripted test**, then **Reset**, then send the notes. The header says **Scripted test**.

## Tests

`tests/field-inspection/agent.test.ts` checks that two different notes produce different reports, that a committed stage is not called again after recovery, and that a finished run marks uncalled stages as skipped.
