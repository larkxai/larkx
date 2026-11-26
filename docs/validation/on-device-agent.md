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

## A2A and LangGraph

These steps have not been run on a phone. Node process-death tests and the LangGraph integration test do not complete this list.

1. Start `examples/langgraph-a2a-agent` on a computer. Set `PUBLIC_URL` to `http://<lan-address>:<port>` before listening so the agent card names that address. Confirm `GET http://<lan-address>:<port>/.well-known/agent-card.json` from another machine.
2. On the phone, open Field inspection, choose A2A, and set the endpoint to that LAN URL. Leave discovery off unless the card URL is exactly that endpoint. Do not enter `localhost`.
3. Start a scripted run. The timeline should show the local run id, the client operation id, a remote task id, a context id, and the delegation state. The remote graph keeps running if the phone is force-quit after the task id is shown.
4. If the timeline shows an additional-input prompt, enter the model number and send remote input. The same task id must remain.
5. Reopen the app and recover the run. The fixture or LangGraph inspection log must not show a second task.
6. Mark the network unavailable before the first send. The delegation stays queued. Restore the network and confirm one send.
7. Cancel after a task id is known. The screen may say the remote task was cancelled. It must not say a completed remote effect was rolled back.

## Telemetry

These steps have not been run on a phone. The Node exporter tests do not complete this list.

1. Leave the telemetry fields empty. Start a scripted run in airplane mode. It finishes, and the status line says telemetry is disabled.
2. Enter a project id and an `lkx_ing_` key for a collector that accepts storage schema 3. Apply telemetry. Confirm the status line names the phase and the pending count.
3. Start a run while the network is unavailable. Force-quit. Relaunch and flush. The collector should show the run's events, including a `WORKFLOW_RECOVERED` event if the run was still open. Prompts and tool results must not be in the batch.
4. Confirm the app does not keep exporting after it leaves the foreground, and that a later flush sends what was still pending.
5. Apply telemetry only after a scripted run has finished. Flush. That finished run must not appear in the collector. A run started after Apply telemetry must appear from its first event.
6. Point the endpoint at an HTTP development collector that answers `302` to another host. The ingestion key must not arrive at the second host. Closing the screen while the collector is down must return the UI promptly, and the next flush after the collector is back must deliver the pending batch.

React Native 0.88 follows redirects inside `NSURLSession` and OkHttp even when JavaScript passes `redirect: "manual"`. Step 6 is the check that this build does not deliver the ingestion key to that second host. Identifier generation without `crypto.randomUUID` is covered by the Node tests and has not been exercised on Hermes.

Record the device, OS, and run id after a real run. Until that note exists, do not describe this checklist as completed.
