# M4 physical-device procedure

This file is the device procedure for the Cloud exporter. It is not a report of a run. No phone or emulator uploaded a journal while this change was written. `cloud.larkx.ai` did not resolve in that environment. Automated coverage is `tests/telemetry`, including a `SIGKILL` against the SQLite export checkpoint. `tests/telemetry/live.test.ts` talks to a real Cloud origin only when `LARKX_CLOUD_ENDPOINT` and `LARKX_INGESTION_KEY` are set. Those variables are not part of CI.

Use the renovation agent in `examples/react-native-agent`. The Test mode is enough to prove the journal. The Device mode is the Cactus path. Either way, Cloud receives the same workflow events. The agent definition does not change.

Do not put a real ingestion key in the repository. Export it in the shell that starts Metro:

```bash
export EXPO_PUBLIC_LARKX_CLOUD_ENDPOINT=https://cloud.example
export EXPO_PUBLIC_LARKX_INGESTION_KEY=lkx_ing_...
```

An empty pair leaves the Cloud card on Disabled. Local tools still run.

## Steps

1. Install a development build. Expo Go cannot load Cactus. The Test mode can use the same build.
2. Start an agent. The screen shows the run id.
3. Tap Sync while the device is online. The card should leave Pending synchronization. Open that run id in LarkX Cloud and confirm the timeline has the committed events and no prompt or tool output.
4. Enable airplane mode. The card should show Offline. Start or continue a run. Local steps still complete.
5. Force-quit during a `RUNNING` step. Swipe the app away. Do not only press Home.
6. Reopen the app. The run id should return. Tap Recover. Completed steps stay completed. The unfinished step retries or blocks according to its effect class.
7. Let the agent finish while the device is still offline.
8. Leave airplane mode. The card should move to Pending synchronization and then, after a flush, Connected. Tap Sync if it stays pending. A suspended app does not keep the timer running.
9. Inspect the same run in Cloud. The timeline should include the events from before the quit and the events committed after recovery. Event order follows `sequence`.

Reset deletes `larkx-agent.db` and `larkx-agent-telemetry.db` together. Deleting only the workflow file can make a reused run id conflict in Cloud.

Record the device, OS, build, run id, and the Cloud timeline here after a real run. Until that note exists, do not describe this procedure as completed.
