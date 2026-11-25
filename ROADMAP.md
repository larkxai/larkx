# Roadmap

LarkX has one execution engine: the C++ runtime in `native/`. Node.js and React Native bind it. A capability is implemented when code and automated checks exist. A phone run is a separate gate. Host compilation is not that gate.

## Implemented

- Agent loop in C++: model request, tool request, committed replay, cancellation, ownership fencing, retry, unknown outcome, and reconcile.
- SQLite schema version 1 inside the C++ runtime.
- `@larkxai/node` and `@larkxai/react-native` as the public SDKs. Same `createRuntime` surface.
- Scripted models for tests and demos.
- Optional Cactus adapter, with a per-instance completion queue. Device inference has not been run.
- `SIGKILL` recovery of the Node example against a reopened SQLite file.
- Metadata telemetry contracts in `@larkxai/telemetry`. The exporter is not attached to the native journal.

## Pending hardware validation

The [on-device checklist](docs/validation/on-device-agent.md) is still open.

- Development builds of `examples/react-native-workflow` on iOS and Android.
- Cactus download, init, tool calling, and `destroy` on a phone.
- Offline completion with a model that is already on the device.
- Force-quit at a committed boundary and during an interrupted tool, then recovery from the same database.

## Later

These are subsequent milestones. They are not in the tree.

- Remote agent delegation. The device keeps the parent run. The remote agent is deployed separately. Persist the outbox and the operation id before sending. Lost acknowledgements need dedupe or an explicit block. This is not a hosted worker fleet.
- A2A, mapped onto that delegation state machine.
- Privacy policies for SDK-managed egress. The default remains device-only.
- Native telemetry export of run, model, tool, recovery, and reconciliation metadata. Prompts, outputs, and tool arguments stay on the device. LarkX Cloud stays optional.
- Production Swift and Kotlin SDKs. `examples/swift-agent` remains an ABI sample.

## Not planned

- A second TypeScript execution engine, or compatibility wrappers for `defineWorkflow` and `createNodeEngine`.
- A Rust port of the runtime.
- A managed coordinator or worker service in this repository.
- Migration of databases created by the removed TypeScript engine.
