# @larkxai/core

## 0.1.2

### Patch Changes

- @larkxai/protocol@0.1.2

## 0.1.1

### Patch Changes

- 2864423: Add the React Native runtime on the existing workflow engine, keep an expired lease from displacing a live mobile owner, and cancel the heartbeat timer when a run stops.
- 4a42ea8: Add a durable agent loop and a Cactus adapter on the existing workflow engine. Agents register their workflow after the engine is created, and each model decision and tool call is one local step.
- 84909e8: Add an optional metadata-only Cloud exporter. Workflow and agent runs use the existing journal. The engine does not wait on ingestion, and step outputs stay on the device.
  - @larkxai/protocol@0.1.1
