# Roadmap

LarkX is the execution layer for on-device agents. `@larkxai/react-native` is the public SDK. `@larkxai/node` stays in this repository so crash recovery and remote delegation can be tested without a mobile build. A capability is implemented when code and automated checks exist. A phone run is a separate gate. Host compilation is not that gate.

Swift and Kotlin SDKs are planned for after the hybrid developer preview. They are not started here.

## Phase 1 — Durable on-device execution

Implemented:

- Shared C++ runtime.
- React Native SDK.
- SQLite persistence.
- Durable agent orchestration.
- Native tool execution.
- Recovery and replay.
- Optional Cactus integration.
- Durable HTTP remote delegation.

Still to validate on hardware:

- A physical iPhone.
- A physical Android phone.
- Real local inference.
- Offline execution.
- Force-quit recovery.
- Mobile networking and remote delegation.

The checklist is [docs/validation/on-device-agent.md](docs/validation/on-device-agent.md).

## Phase 2 — Ecosystem interoperability

1. A2A client interoperability.
2. A real LangGraph remote agent. The agent is deployed on its own. It is not another LarkX runtime. Prefer A2A when that link is practical. The HTTP task transport remains the generic fallback and the current test foundation.
3. A Google ADK interoperability example.
4. Privacy-aware delegation.
5. Destination-specific data egress policies.

The intended demonstration is a mobile field-inspection agent. It reads local notes, uses an on-device model, calls native tools, finds a defective component, and delegates supplier research to an independently deployed LangGraph agent. The local run stores that delegation, survives application termination, recovers the same remote task, and finishes the report on the device. The remote agent uses existing server-side infrastructure. LarkX supplies the mobile execution and coordination layer. This demonstration is the target for the interoperability milestone. It has not been validated.

## Phase 3 — Developer adoption

- Native execution telemetry.
- Optional LarkX Cloud integration. Cloud does not own the local execution record.
- Developer documentation.
- Production-quality examples.
- A public developer preview.
- Design-partner validation.

## Phase 4 — Native platform expansion

- Standalone Swift SDK.
- Standalone Kotlin SDK.
- More local inference providers when developers ask for them.
- More edge environments when developers ask for them.

Later research may include resource-aware execution, supported background scheduling, and coordination across devices. Those are not commitments.

## Not planned

- A second TypeScript execution engine, or compatibility wrappers for the removed workflow API.
- A competing server-side agent framework, a remote-agent host, or a model-training system.
- A proprietary agent protocol as a replacement for A2A.
- A Rust port of the runtime.
- A managed coordinator or worker service in this repository.
- Migration of databases created by the removed TypeScript engine.
