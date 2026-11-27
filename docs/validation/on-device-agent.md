# Public beta validation

Founder checklist for `@larkxai/react-native` 0.4.1. Automated checks do not complete a physical-device row. Mark a device row only after it happens on that phone. Compiling the shared C++ library, the Android JNI library, or the iOS bridge is not a device pass.

The application is `examples/react-native-agent`. It depends on this checkout through `workspace:*`. At this revision that is the same 0.4.1 source as the published npm package. It is not a second demo, and it is not a fresh `npm install` of the tarball. A fresh install is checked by `node scripts/inspect-published-sdk.mjs`.

Every device scenario below is **manual verification required**.

## Prerequisites

- A physical iPhone or Android phone. Simulators are not this list.
- Node.js 22.13 or newer and pnpm 10.33.4, for this repository.
- Expo SDK 58 and React Native 0.88, which is what the example declares. This repository has not tested other major versions.
- For Android: the NDK your React Native app already uses, CMake 3.22 or newer, and a network during the first native configure. The Android build downloads SQLite amalgamation 3.45.1 (`3450100`) from sqlite.org. `minSdk` 24. `compileSdk` 35.
- For iOS: Xcode, CocoaPods, and iOS 15.1 or newer. The pod links the system `libsqlite3`.
- Optional, only for local inference: `cactus-react-native` 1.13.1 and `react-native-nitro-modules` 0.33.9. The example already depends on them.
- Optional, only for Cloud: `expo-crypto`, an authorized Cloud application, and an ingestion key that starts with `lkx_ing_`. Do not commit the key.

Hello World does not need Cactus, Cloud, or a remote server.

## Build

From the repository root:

```bash
pnpm install
pnpm build
pnpm --filter @larkxai/example-react-native-agent exec expo prebuild
pnpm --filter @larkxai/example-react-native-agent exec expo run:ios
pnpm --filter @larkxai/example-react-native-agent exec expo run:android
```

`expo prebuild` and the device runs have not been executed in CI. Expo Go cannot load `LarkXNativeCore` or Cactus. If `createRuntime` throws `LarkXNativeCore is not installed`, the binary was built without the module.

The field screen uses `larkx-field.db` for runs and `larkx-field-data.db` for tool effects. Scripted runs are agent `field-assistant-scripted` version 1. Local-model runs are `field-assistant-local` version 1. Recover a run in the matching mode. Developer details shows the run id, the operation id, and the remote task id.

## What automation already covers

These are not device passes.

| Check                                                                           | Evidence                                                  | What it does not prove                                     |
| ------------------------------------------------------------------------------- | --------------------------------------------------------- | ---------------------------------------------------------- |
| Published tarball and a fresh `npm install`                                     | `node scripts/inspect-published-sdk.mjs`                  | A native application build or a phone run                  |
| Public Hello World result `Seal needs service.`                                 | Node host test in `tests/docs/public-snippets.test.ts`    | Hermes, SQLite on a phone, or a development build          |
| Committed tool reuse, pure and idempotent retry, non-idempotent unknown outcome | Existing runtime tests and Node `SIGKILL` recovery        | Force-quit from the iOS or Android app switcher            |
| `run_rejected` isolation, 429 retry, history conflict, accepted-batch replay    | `tests/telemetry/export.test.ts`                          | Production Cloud, or a 20,000-event run against production |
| Redirect rejection and whole-request timeout                                    | Node socket tests, plus the published `LarkXHttp` sources | A phone, a captive portal, or a slow radio                 |
| Shared C++ tests                                                                | `ctest` on the `native` tree                              | The React Native application                               |
| Android JNI from this checkout, and from the published tarball                  | `native-android` CI when `ANDROID_NDK` is set             | An APK, an emulator, or a phone                            |
| iOS bridge objects, including `LarkXHttp.mm`                                    | `packages/react-native/ios/ci-compile.sh` on macOS CI     | An `.app`, a simulator, or a phone                         |

## Manual scenario A — Installation

Status: manual verification required.

1. Build and launch the example on a physical device with the commands above.
2. Open the scripted runtime lab from Settings, or start a scripted inspection.
3. Confirm the diagnostics line names the native C++ runtime and includes the run id.

Expected: the scripted run finishes. A Hello World-equivalent scripted result is `Seal needs service.` when that script is the one in the documentation. The field-inspection script finishes with a saved local report instead of that sentence.

Failure: `LarkXNativeCore is not installed`, the database is rejected, or the scripted run throws before a result. Do not mark the row passed because Metro bundled the JavaScript.

Evidence: device, OS, and the run id from developer details.

## Manual scenario B — Real inference

Status: manual verification required.

1. Open Field inspection, choose Local model, and press Prepare model.
2. Wait until the status says the model is ready and tool calling is supported. The states are Not downloaded, Downloading, Initializing, Ready, and Failed.
3. Start a local-model inspection. Do not switch the screen to scripted mode.

Expected: Cactus downloads and initializes `qwen3-0.6b`, the model selects tools, local tools run, and the report is the model's completion. The UI must not label this run as scripted.

Failure: the download never starts, initialization fails, or the result is the predetermined script. A scripted run is not this scenario.

Evidence: the model status text and the run id. This repository has not measured the download size.

## Manual scenario C — Offline execution

Status: manual verification required.

1. Prepare the model while online.
2. Enable airplane mode.
3. In Settings, turn the runtime network switch off. Airplane mode does not flip that switch.
4. Force-quit, relaunch, and start a new local-model run.

Expected: local tools and the on-device model finish with no network.

Failure: the run waits on a remote endpoint, or it only succeeds while the radio is on. A scripted run does not prove inference offline.

## Manual scenario D — Force-quit recovery

Status: manual verification required.

1. Start a multi-step scripted or local run.
2. Wait until developer details shows a committed operation. The timeline shows model requests, tool requests, and commits.
3. Force-terminate the app from the system app switcher. Do not use an in-app pause button. That button stays in the same process.
4. Reopen the app. Continue registers the same agent name and version and resumes that run id.

Expected: the original run id is unchanged. Committed tool results are reused and those handlers do not run again. A `pure` or `idempotent` tool that had not committed may run again. An interrupted `non-idempotent` tool stays blocked until reconcile, and its handler does not run on its own. The recorded script does not call `record_part_replacement`. A local model hits it only if the model calls it.

Failure: a new run id, a second copy of a committed effect, or the app continuing to execute while it was force-quit. The process does not keep running after the operating system kills it.

## Manual scenario E — Hybrid recovery

Status: manual verification required.

On the computer, from `examples/langgraph-a2a-agent` after `pnpm --filter @larkxai/example-langgraph-a2a build`:

```bash
PUBLIC_URL=http://192.168.1.20:8791 LARKX_LANGGRAPH_HOLD=1 PORT=8791 node dist/server.js
```

Replace `192.168.1.20` with that computer's LAN address. Set `PUBLIC_URL` before the process listens. Confirm from another machine:

```bash
curl http://192.168.1.20:8791/.well-known/agent-card.json
```

`LARKX_LANGGRAPH_HOLD=1` keeps the remote task outstanding until:

```bash
curl -X POST http://192.168.1.20:8791/_release
```

`GET /_inspection` lists graph executions. It is not an A2A method. Restarting this server drops in-memory tasks. The phone cannot recover a task the server forgot.

On the phone:

1. Choose A2A and set the endpoint to `http://192.168.1.20:8791`. Do not enter `localhost` or `127.0.0.1`.
2. Leave the runtime network switch on.
3. Start a run and wait until developer details shows a remote task id that is different from the local operation id.
4. Force-terminate the app. Leave the LangGraph process running.
5. Reopen the app and continue the same run.
6. Release the hold. If the graph asks for a model, send `Model P-104` from Settings.

Expected: one remote task. Recovery polls that task id and does not submit another. The local run then completes. Cancelling the local run does not roll back a remote effect that already happened.

Failure: a second task id, a run that only works with `127.0.0.1`, or a claim that the remote effect was exactly-once.

## Manual scenario F — Cloud observability

Status: manual verification required. Do not create a production application from this repository, and do not paste the ingestion key into a commit, a log, or a screenshot.

1. Sign in to Cloud and create a test application you are allowed to use.
2. Create a scoped ingestion key.
3. In the example Settings, enter the application id, the key, and the collector origin. Apply, then reopen the app before the recorded run.
4. Run an agent. Confirm model and tool operations in the trace. Prompts, model text, tool arguments, and tool results must not be in the batch.
5. Repeat with the runtime network switch off and airplane mode on. Restore connectivity and flush. A run that was open should show `WORKFLOW_RECOVERED` after a force-quit and relaunch. A run that finished before telemetry was applied must not appear.

Expected: metadata for the real run, including a remote delegation when scenario E ran with telemetry already applied. The agent still finishes when the collector is down.

Failure: the key appears in the trace, a finished historical run is backfilled, or a health check is treated as proof. `GET /v1/health` returning `telemetryVersion` 1 does not prove storage schema 3 is accepted.

## Manual scenario G — Networking

Status: manual verification required.

Where practical, on a device, point telemetry or a remote endpoint at a collector you control:

- A 302, 307, and 308, including HTTPS to HTTP, must not receive the ingestion key or the body on the second host.
- Cancel a request and confirm the UI returns.
- A slow response that exceeds the deadline fails as a timeout and does not advance the telemetry cursor.
- Closing the screen while the collector is down returns promptly. The next flush can deliver the pending batch.
- On Android, if the app has installed a process-wide `CookieHandler`, those cookies can still be attached. iOS uses an ephemeral session and does not accept cookies. Do not treat the Android cookie case as fixed.

## Launch checklist

### Automated preparation

| Item                                       | Status                                                                                                                                    |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Published npm package inspected            | Automated verification passed, by `scripts/inspect-published-sdk.mjs`                                                                     |
| Fresh installation verified                | Automated verification passed, outside the workspace                                                                                      |
| Public exports and TypeScript declarations | Automated verification passed                                                                                                             |
| Native build coverage reviewed             | Completed. See the table above for the limit of each check                                                                                |
| Android JNI from the published tarball     | Automated verification passed only after `native-android` CI succeeds. A local machine without the NDK has not compiled it                |
| iOS bridge compile                         | Automated verification passed only after macOS CI succeeds. It is not an application build                                                |
| Automated tests                            | Passed locally: `pnpm lint`, `pnpm format:check`, `pnpm typecheck`, and `pnpm test` (164). CI on the pull request is the remaining record |
| Documentation synchronized to 0.4.1        | Completed in this change                                                                                                                  |
| README updated                             | Completed in this change                                                                                                                  |
| Field-inspection application prepared      | Completed as source review. Device execution is not done                                                                                  |

### Founder manual validation

| Item                       | Status                       |
| -------------------------- | ---------------------------- |
| iOS device execution       | Manual verification required |
| Android device execution   | Manual verification required |
| Actual Cactus inference    | Manual verification required |
| Offline agent execution    | Manual verification required |
| Force-quit recovery        | Manual verification required |
| Hybrid agent recovery      | Manual verification required |
| Production Cloud telemetry | Manual verification required |
| Flagship demo recording    | Manual verification required |

### Product launch

These are tracked here so they are not forgotten. This pull request does not perform them.

| Item                                                                  | Status                                                                                                                                         |
| --------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Website https://larkx.ai and https://larkx.ai/enterprise respond      | Automated verification passed as public HTTP checks. Content review is separate                                                                |
| Documentation https://docs.larkx.ai and the three quickstarts respond | Automated verification passed as public HTTP checks. The pages still show the previous deployment until this documentation change is published |
| Cloud https://cloud.larkx.ai and `GET /v1/health` respond             | Automated verification passed. Schema acceptance is not verified                                                                               |
| Privacy Policy and Terms                                              | Not verified in this repository                                                                                                                |
| Enterprise inquiry delivery                                           | Not verified in this repository                                                                                                                |
| Swift and Kotlin interest collection                                  | Not applicable to this SDK pull request                                                                                                        |
| GitHub repository ready                                               | Completed for the README and the validation guide, pending review                                                                              |
| Launch announcement                                                   | Not started                                                                                                                                    |

## Recording

The 60–90 second sequence is [docs/demo/flagship-mobile-demo.md](../demo/flagship-mobile-demo.md). Record it after the rows above that the clip depends on have actually passed. Do not generate a stand-in video.
