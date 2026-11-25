# @larkxai/react-native

## 0.1.2

### Patch Changes

- 7fbe7d6: Schedule the native host driver from agent.start, and make run.result wait. List persisted runs from the C++ store. Preserve embedded NUL across the iOS, Android, Node, and SQLite boundaries. Add cactusHostModel for the native host's JSON model request. Queue completions per Cactus model so one cancellation does not stop another model. Keep scripted and local field agents on distinct identities, and reject recovery with a different model.
- 8403c0d: Add a preview React Native host for the shared C++ core at `@larkxai/react-native/native`. The default export remains the TypeScript engine. One host driver serves a run id, Android session destruction waits for in-flight calls, and JNI uses standard UTF-8.
  - @larkxai/core@0.1.2
  - @larkxai/protocol@0.1.2
  - @larkxai/storage-sqlite@0.1.2

## 0.1.1

### Patch Changes

- 2864423: Add the React Native runtime on the existing workflow engine, keep an expired lease from displacing a live mobile owner, and cancel the heartbeat timer when a run stops.
- 4a42ea8: Add a durable agent loop and a Cactus adapter on the existing workflow engine. Agents register their workflow after the engine is created, and each model decision and tool call is one local step.
- 84909e8: Add an optional metadata-only Cloud exporter. Workflow and agent runs use the existing journal. The engine does not wait on ingestion, and step outputs stay on the device.
- Updated dependencies [2864423]
- Updated dependencies [4a42ea8]
- Updated dependencies [84909e8]
  - @larkxai/core@0.1.1
  - @larkxai/storage-sqlite@0.1.1
  - @larkxai/protocol@0.1.1
