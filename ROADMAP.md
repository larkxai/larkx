# Roadmap

One C++ runtime in `native/` is the execution engine. `@larkxai/node` and `@larkxai/react-native` are the public SDKs. A capability is implemented when code and automated checks exist. A phone run is a separate gate. Host compilation is not that gate.

## Implemented in this migration

- The C++ runtime plans model calls, tool calls, replay, retries, operation ids, ownership, cancellation, unknown outcomes, reconciliation, and remote delegation.
- SQLite schema version 2 is the execution record. An owned schema 1 file gains the delegation table. The host does not keep a second database.
- Both public SDKs expose `createRuntime`, `defineTool`, `remoteAgent`, `scriptedModel`, and `sqlite`.
- The Node addon is built from the packaged C++ sources and does not load a React Native build path.
- Cactus is an optional React Native subpath. The root import does not load it.
- `SIGKILL` tests cover an interrupted model call, a committed model decision, a committed tool result, an idempotent retry, a blocked non-idempotent call, explicit reconciliation, and remote delegation across process death.
- A local agent can delegate to an independent remote agent. The reference HTTP fixture and the Node hybrid example cover that path. A2A is not part of it.

## Next

1. Physical-device validation. This may proceed beside the later items and remains required before mobile support is described as validated.
2. A2A interoperability on the delegation record. Multi-turn remote input waits for that work.
3. Privacy-aware orchestration and egress policies. The default remains device-only.
4. Native telemetry export of run metadata. Prompts, outputs, and tool arguments stay on the device.
5. LarkX Cloud integration. Cloud does not own the local execution record.
6. Public developer preview.
7. Standalone Swift SDK. `examples/swift-agent` stays an ABI sample until then.
8. Standalone Kotlin SDK.

## Not planned

- A second TypeScript execution engine, or compatibility wrappers for the removed workflow API.
- A Rust port of the runtime.
- A managed coordinator or worker service in this repository.
- Migration of databases created by the removed TypeScript engine.

The device checklist is [docs/validation/on-device-agent.md](docs/validation/on-device-agent.md).
