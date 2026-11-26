# Flagship mobile demonstration

A technician inspects a fictional cooling-water pump, identifies a seal problem from local notes, asks an independent LangGraph agent for supplier research, and keeps the inspection when the app is force-quit. The application is `examples/react-native-agent`. It demonstrates LarkX. It is not a commercial inspection product.

The code for this walkthrough is in the repository. The sequence has not been run on a physical phone. A green Node suite, a Metro bundle, or a simulator does not complete the device checklist below.

## Product story

Industrial sites lose connectivity. Inspection notes, the equipment specification, and earlier observations are already on the phone. A local model and local tools can run while the radio is off. Supplier research is a separate agent. The phone can die while that remote task is outstanding. LarkX keeps the run id, the operation id, and the remote task id, then continues the same run. LarkX Cloud, when a compatible collector is configured before the run starts, shows the metadata. It does not resume the run.

The equipment, notes, and supplier catalog are fictional. Recommendations on the report screen are illustrative. They are not verified industrial safety advice.

## Architecture

- The React Native application owns the screen and the local notes.
- `@larkxai/react-native` drives the C++ runtime. The run record is `larkx-field.db`.
- Local tools read and write `larkx-field-data.db`. Reads are `pure`. `save_inspection_report` is `idempotent` and dedupes on the operation id. `record_part_replacement` is `non-idempotent` and is not part of the recorded script.
- Scripted test mode chooses the next tool from committed results. Local AI mode calls Cactus `qwen3-0.6b`. Scripted mode is never labeled as local inference.
- Supplier research is `examples/langgraph-a2a-agent` over A2A 1.0. The delegated arguments are the objective, the equipment, and the component. Inspection notes are not sent. That is application-level data minimization, not a privacy-policy engine.
- Telemetry is optional. The example posts to the endpoint you apply, with a 3 second flush interval. The SDK default remains 15 seconds.

## Setup

Node.js 22.13 or newer. pnpm 10.33.4. Expo SDK 58. React Native 0.88.

```bash
pnpm install
pnpm build
```

LangGraph server, reachable from the phone:

```bash
pnpm --filter @larkxai/example-langgraph-a2a build
cd examples/langgraph-a2a-agent
PUBLIC_URL=http://192.168.1.20:8791 LARKX_LANGGRAPH_HOLD=1 PORT=8791 node dist/server.js
```

Replace `192.168.1.20` with the computer's LAN address. Set `PUBLIC_URL` before the process listens so the agent card names that address. `localhost` on the phone is the phone. A public HTTPS endpoint is an address the phone can reach without being on the same network. This repository does not deploy one.

`LARKX_LANGGRAPH_HOLD=1` is a demonstration control. The remote task exists and stays outstanding until `POST http://192.168.1.20:8791/_release`. It does not add a delay to a local model or tool call. Deterministic mode needs no model key. `LARKX_LANGGRAPH_MODEL=openai` with `OPENAI_API_KEY` is an optional real remote model. Label that run as a remote model. The default catalog is fictional.

Development build. Expo Go cannot load the native runtime.

```bash
pnpm --filter @larkxai/example-react-native-agent exec expo prebuild
pnpm --filter @larkxai/example-react-native-agent exec expo run:ios
pnpm --filter @larkxai/example-react-native-agent exec expo run:android
```

Local AI mode: open Settings, choose Local AI, and download `qwen3-0.6b` before recording. The states are Not downloaded, Downloading, Initializing, Ready, and Failed. Keep the download out of the recording. Tool calling with this model has not been confirmed on a phone. Do not switch models in this repository until a device run shows that this one fails.

Cloud: create a project and a scoped `lkx_ing_` key in a collector that accepts storage schema 3. In Settings, enter the project id, the key, and the collector origin, then Apply and reopen before starting the recorded inspection. The key is stored in the platform keystore. It is not written to SQLite. Leave the fields empty to run with telemetry disabled.

Production `https://cloud.larkx.ai` was last deployed on 20 November 2026. That deployment accepts schema 1 only. The Cloud repository accepts schema 3. Do not point the recorded run at production until a deploy that accepts schema 3 has been verified. A local collector is the development destination. Configure it before the run. Runs that already existed are not backfilled.

The runtime network switch in Settings is the value `isOnline` returns. Turning on airplane mode does not change it by itself. For the offline stage, turn the switch off and enable airplane mode.

## Demonstration sequence

1. Start offline. The model is already downloaded. The runtime network switch is off. Open the cooling-water pump and run the inspection. The agent reads notes, specifications, and previous inspections, then the local model analyzes them. In scripted test mode the next tool is predetermined. In Local AI mode the model chooses the tool.
2. Restore connectivity. Turn the runtime network switch on. The agent delegates supplier research. The developer panel shows the same run id, the operation id, and the remote task id once the runtime has them.
3. Watch the collector. Eligible events are metadata. They include local model and tool operations, the remote delegation, and the last observed run status. Prompts and tool results are not in the batch.
4. Terminate the application. Force-quit the process from the system while the remote task is outstanding. Do not use the release-boundary button. That button only continues a pause in the same process. With `LARKX_LANGGRAPH_HOLD=1`, the LangGraph process keeps the task.
5. Recover. Reopen the app. The dashboard lists the interrupted inspection. Continue registers the same agent and resumes that run id. Committed tool results are reused. The known remote task is polled. A second task is not submitted.
6. Complete. Release the LangGraph hold with `POST /_release`. If the deterministic graph asks for a model, send `Model P-104` from Settings. The agent saves the report locally and finishes. The collector receives the remaining metadata, including the recovery observation and the original remote task.

A new inspection uses Start inspection again. That creates a new run and does not delete other rows. To wipe the demo, delete `larkx-field.db`, its telemetry file, and `larkx-field-data.db` from the app documents directory.

## Expected Cloud trace

When the collector accepts schema 3 and telemetry was applied before the run:

- Local model operations and local tool operations from the first process.
- Remote delegation and remote task acceptance, with the task id.
- `WORKFLOW_RECOVERED` after the process starts again and finds the non-terminal run.
- The same remote task observed after recovery, not a second submission.
- The final local completion.

`WORKFLOW_RECOVERED` means a new process found the run. It does not record why the previous process stopped. The remote interval is the time the device observed the delegation, not the remote agent's compute time. A remote task is not exactly-once.

## Recording script

Record a physical phone beside the real collector trace. This repository does not contain that recording.

1. Show the dashboard and the cooling-water pump. The phone is in airplane mode and the runtime network switch is off.
2. Open the pump. The notes are already on the device. Run the inspection.
3. Show on-device steps completing with no network.
4. Restore the network. Show the remote research step and, in the developer panel, the task id.
5. Show the collector receiving the local operations and the delegation.
6. Force-quit the app. Leave the LangGraph server running.
7. Reopen the app. Continue the same inspection. Show the original run id.
8. Release the remote hold. Show the saved report and the disclaimer.
9. Show the collector trace with the recovery event and the same remote task.

Do not add delays to local model or tool operations to stretch the trace.

## Manual device checklist

Do not mark a row from a Node test, a Metro bundle, or a simulator.

Local execution:

- Model download, initialization, and a real Cactus tool-calling response.
- The same local tools in airplane mode.
- The report row in `larkx-field-data.db` after completion, once.

Durable recovery:

- Force-quit before a model response commits, and after it commits.
- Force-quit during a pure tool, and after that tool result commits.
- Force-quit during `save_inspection_report`. Reopen and confirm one stored report for that operation id.
- An interrupted `record_part_replacement` becomes an unknown outcome and is not retried until reconcile. The recorded script does not call this tool. A Local AI run only hits it if the model calls it.

Remote delegation:

- A2A to the LangGraph server on the LAN address.
- The task id is persisted before the force-quit.
- Recovery polls that task and does not submit another.
- The report completes after recovery.

Telemetry:

- Schema 3 ingestion to a compatible collector.
- Events buffered offline, then flushed after reconnect and after process restart.
- The installation id is stable across relaunch and is not a hardware identifier.
- Batches contain no prompt and no tool result.
- A run that finished before telemetry was applied does not appear.
- Closing the app while the collector is down returns promptly.
- A 302, 307, and 308 to another host, including HTTPS to HTTP, do not receive the ingestion key or the request body.

Hermes:

- `expo-crypto` UUID, UTF-8 batch encoding, native module load, Cactus, request cancellation, and file persistence.

## Known limitations

- No physical-device run is recorded in this repository.
- `qwen3-0.6b` is the only Cactus model wired here. Its tool calling on a phone is unvalidated.
- Native redirect prevention is not implemented. JavaScript treats 3xx and a changed final URL as not acknowledged. React Native 0.88 can still send the body and, on Android, the `Authorization` header can be stripped only after the platform follows the redirect. The same gap applies to HTTP and A2A delegation. Node tests do not prove the phone withheld the body.
- Production Cloud ingestion is not verified.
- The LangGraph example stores tasks in memory. Restarting that server drops them. The phone's recovery cannot retrieve a task the server forgot.
- The runtime network switch is not the radio.
- Published npm `@larkxai/react-native` 0.3.0 does not include A2A or `larkxCloud`. This demo uses the workspace source.

## Troubleshooting

- `LarkXNativeCore is not installed`: the app is running in Expo Go. Use the development build.
- Recovery says the mode does not match: the persisted agent is scripted or local. Select that mode before Continue.
- The remote step never starts: the endpoint is empty, the runtime network switch is off, or the phone cannot reach the LAN address.
- The remote task asks for a model: send `Model P-104` from Settings. The task id stays the same.
- Cloud stays Unauthorized: the key must start with `lkx_ing_` and belong to the project.
- Cloud stays Offline: the runtime network switch is off, or the collector is down. The inspection still runs.
- A production endpoint returns an error for schema 3: use a collector built from current Cloud source until production is redeployed.
