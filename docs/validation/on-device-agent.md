# On-device agent validation

Physical-device checks for the native React Native host. Automated tests do not complete this list. Mark a step only after it happens on a phone.

Build from `examples/react-native-workflow`:

```bash
pnpm install
pnpm --filter @larkxai/react-native build
cd examples/react-native-workflow
npx expo prebuild
npx expo run:ios
npx expo run:android
```

Expo Go cannot load `LarkXNativeCore` or Cactus. The field card uses database `larkx-field.db` in the app documents directory. Runs are discovered with `runtime.listRuns()`. React state is not the record of the run.

## Install the local model

1. Open the field-inspection card and choose Local model.
2. Press Prepare model. The status shows download progress, then initialization time and the model name from `getModelName()`.
3. Confirm the status says tool calling and cancellation are supported, and structured output is not.

## Scripted timeline

1. Choose Scripted and press Start with the default inspection message.
2. Confirm the timeline shows run-started, model requests, tool requests, commits, and completion.
3. Confirm the diagnostics line says `Execution backend: Native C++` and includes the ABI, run id, model count, and tool count.

## Offline

1. Prepare the model while online, then enable airplane mode.
2. Force-quit and relaunch.
3. Start a new local-model run. It must finish with local tools and the on-device model. No LarkX Cloud call is required.

## Termination

Arm one boundary, press Start, and force-quit while the card says that boundary is held. Relaunch, register the same agent by pressing Recover on that run id.

| Boundary                   | Expected recovery                                                                                                                                                                                                                  |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| before-model               | The model step is open and its result is not committed. Recovery retries it and keeps the operation id.                                                                                                                            |
| during-model               | Same as before-model. The barrier is inside the model call, before the result is submitted.                                                                                                                                        |
| after-model-commit         | The committed model call does not run again. The next tool or final step continues.                                                                                                                                                |
| before-tool                | The core has opened the tool step and the handler has not run. A pure or idempotent tool retries with the same operation id. A non-idempotent tool becomes `BLOCKED` with `UNKNOWN_OUTCOME` and is not called again.               |
| during-idempotent-tool     | `save_inspection_report` has written its row in `larkx-field-data.db` and the core has not committed the result. Recovery retries the same operation id. The tool returns `deduplicated: true` and does not write a second report. |
| during-non-idempotent-tool | `record_part_replacement` has written its row and the core has not committed the result. Recovery enters `UNKNOWN_OUTCOME`, does not call the tool, and waits for Reconcile.                                                       |
| after-tool-commit          | The committed tool does not run again. The agent continues.                                                                                                                                                                        |
| before-completion          | The run completes from the stored decision. The model is not called again.                                                                                                                                                         |

`record_part_replacement` is non-idempotent. The notes and equipment tools are pure. `save_inspection_report` is idempotent. The scripted mode always issues a seal because the local notes describe a weeping seal. Local mode does not use that script. The model decides.

When a run is `BLOCKED`, check `larkx-field-data.db` through the card. Press Reconcile completed if the effect row is the outcome you accept. Press Reconcile not applied if it did not happen. Press Reconcile retry only when you have decided the operation should run again. LarkX does not claim exactly-once execution.

## Lifecycle

1. Background the app during a model call, then return. The run continues or recovers when the process is alive. It does not keep executing while the OS has killed it.
2. Reload the JavaScript bundle. Recover the run from the persisted list.
3. Cancel during local inference. The run becomes `CANCELLED` and the model is stopped when Cactus honors `stop()`.
4. Relaunch before Prepare model and try to recover a local run. The card shows the model error. It does not invent a result.

## Measurements

Record the numbers the card prints. Do not fill these in from a guess.

- Runtime initialization milliseconds.
- Model initialization milliseconds.
- Model duration and tool duration.
- Time to first token, only if Cactus reported it.
- Recovery time printed after Recover.
- Model and tool counts before the kill and after recovery.

Memory and tokens per second are not shown unless the model response includes them.
