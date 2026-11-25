# Roadmap

One C++ runtime in `native/` is the execution engine. `@larkxai/node` and `@larkxai/react-native` are the public SDKs. A capability is implemented when code and automated checks exist. A phone run is a separate gate. Host compilation is not that gate.

## Implemented in this migration

- The C++ runtime plans model calls, tool calls, replay, retries, operation ids, ownership, cancellation, unknown outcomes, and reconciliation.
- SQLite schema version 1 is the execution record. The host does not keep a second database.
- Both public SDKs expose `createRuntime`, `defineTool`, `scriptedModel`, and `sqlite`.
- The Node addon is built from the packaged C++ sources and does not load a React Native build path.
- Cactus is an optional React Native subpath. The root import does not load it.
- `SIGKILL` tests cover an interrupted model call, a committed model decision, a committed tool result, an idempotent retry, a blocked non-idempotent call, and explicit reconciliation.

## Next

1. Finish this C++ runtime migration and the two-SDK package layout.
2. Physical-device validation. This may proceed beside the later items and remains required before mobile support is described as validated.
3. Durable remote agent delegation. The device keeps the parent run. The remote agent is deployed by the application. This repository does not host it.
4. A2A interoperability on that delegation record.
5. Privacy-aware orchestration and egress policies. The default remains device-only.
6. Native telemetry export of run metadata. Prompts, outputs, and tool arguments stay on the device.
7. LarkX Cloud integration. Cloud does not own the local execution record.
8. Public developer preview.
9. Standalone Swift SDK. `examples/swift-agent` stays an ABI sample until then.
10. Standalone Kotlin SDK.

## Not planned

- A second TypeScript execution engine, or compatibility wrappers for the removed workflow API.
- A Rust port of the runtime.
- A managed coordinator or worker service in this repository.
- Migration of databases created by the removed TypeScript engine.

The device checklist is [docs/validation/on-device-agent.md](docs/validation/on-device-agent.md).
