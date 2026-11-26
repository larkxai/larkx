# @larkxai/react-native

## 0.3.0

### Minor Changes

- 0ef76c0: A local agent can delegate a task to an independent remote agent. The C++ runtime stores the operation before the host sends it, keeps the client operation id distinct from the remote task id, and recovers a lost acknowledgement only from the capabilities declared for that delegation. Dedupe and lookup stay off until declared. Redirects are not followed, and an offline lookup does not treat a possibly sent operation as never sent.

  `remoteAgent` is exported from `@larkxai/react-native`. The HTTP task protocol remains the generic transport and the test foundation. A2A is the planned interoperability protocol and is not implemented. `@larkxai/node` stays in the workspace for tests and is not published.

## 0.2.0

### Minor Changes

- e217da5: Ship one C++ runtime behind two public SDKs. `@larkxai/node` and `@larkxai/react-native` bundle the host driver and no longer depend on separately published packages.

  `@larkxai/host`, `@larkxai/protocol`, `@larkxai/cactus`, and `@larkxai/telemetry` stay in the repository as private modules. Existing npm versions of those names, and of `@larkxai/core`, `@larkxai/agent`, `@larkxai/storage-memory`, `@larkxai/storage-sqlite`, and `@larkxai/testing`, stay published. This release does not unpublish them.

  Import `createRuntime`, `defineTool`, `scriptedModel`, and `sqlite` from `@larkxai/node` or `@larkxai/react-native`. Cactus is `@larkxai/react-native/cactus`. There is no `/native` entry and no compatibility wrapper for the TypeScript workflow engine.

  Open a new SQLite file. This runtime writes SQLite `application_id` `0x4C585254` and does not migrate or delete a database created by the TypeScript engine or by an earlier native preview. A file with any other id is rejected.

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
