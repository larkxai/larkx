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

1. A2A 1.0 JSON-RPC client interoperability. Implemented in the React Native SDK. Automated against a fixture and a LangGraph example. Not yet run on a phone.
2. A real LangGraph remote agent. Implemented as `examples/langgraph-a2a-agent`. It is deployed on its own. It is not another LarkX runtime. The HTTP task transport remains the generic fallback.

Google ADK interoperability is postponed until a product need is concrete. It is not a current milestone.

The intended demonstration is a mobile field-inspection agent. It reads local notes, uses an on-device model, calls native tools, finds a defective component, and delegates supplier research to an independently deployed LangGraph agent. The local run stores that delegation, survives application termination, recovers the same remote task, and finishes the report on the device. The Node process-death tests and the LangGraph integration test cover that sequence on a computer. The same sequence has not been run on a phone. The checklist is [docs/validation/on-device-agent.md](docs/validation/on-device-agent.md).

## Phase 3 — Observe on-device execution

Current order:

1. Native execution telemetry. The device-side exporter is implemented. It is opt-in, metadata-only, and replayed from the native journal. See [docs/architecture/telemetry.md](docs/architecture/telemetry.md).
2. LarkX Cloud ingestion of storage schema 3 and the dashboard that reads those events. Proposed in [docs/cloud-native-telemetry.md](docs/cloud-native-telemetry.md). Not implemented in the Cloud repository. Cloud does not own the local execution record.
3. The field-inspection demonstration on a phone: offline local tools and model, reconnect, LangGraph over A2A, force-quit, recover the same remote task, and flush telemetry. The example has the controls. The phone run is open.
4. Physical-device validation. The checklist is [docs/validation/on-device-agent.md](docs/validation/on-device-agent.md).
5. Privacy-aware orchestration and destination-specific egress. Separate from metadata export. Not started.
6. A public developer preview after the Cloud dashboard and a device run exist.

Design-partner validation follows the preview. It is not a substitute for the phone checklist.

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
