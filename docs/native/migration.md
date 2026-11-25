# Native runtime

The C++ runtime in `native/` is the execution engine. This note is the current binding layout. The TypeScript workflow engine has been removed.

## Versions

| Name           | Value     | Meaning                                                      |
| -------------- | --------- | ------------------------------------------------------------ |
| Protocol       | 1         | States, errors, and effect classes in `@larkxai/protocol`    |
| Storage schema | 1         | Tables created by the C++ store                              |
| ABI            | 2         | `larkx.h` request and submit calls                           |
| Agent version  | per agent | Registered with `createAgent`. A run does not change version |

## Who does what

`larkx_run_drive` returns one request: invoke a model, invoke a tool, wait, reconcile, or finish. The private host driver performs that request and submits the result. `@larkxai/node` loads `larkx_native.node` from its own package. `@larkxai/react-native` calls `NativeModules.LarkXNativeCore`. Neither SDK plans the next step.

The core does not import React Native, Node, Cactus, or any other model library.

## Recovery

Open the same SQLite file and register the same agent name and version. `runtime.resume(runId)` schedules the driver.

- A committed model or tool step is replayed from storage.
- An interrupted `pure` or `idempotent` step may run again. The operation id stays the same.
- An interrupted `non-idempotent` step blocks the run. `run.reconcile` records retry, complete, or fail. `resume` alone does not guess the outcome.

The runtime does not delete a database it does not understand. Do not point it at a file written by the removed TypeScript engine.

## What a host build does not prove

`ctest` on Linux or macOS, the Node addon tests, and the CI compile of the iOS bridge and Android JNI library do not run the agent on a phone. The open checklist is [docs/validation/on-device-agent.md](../validation/on-device-agent.md).
