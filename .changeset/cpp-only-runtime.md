---
"@larkxai/cactus": major
"@larkxai/host": major
"@larkxai/node": major
"@larkxai/protocol": major
"@larkxai/react-native": major
"@larkxai/telemetry": major
---

Remove the TypeScript execution engine. `@larkxai/react-native` and `@larkxai/node` both drive the shared C++ runtime.

The React Native public import is `createRuntime`, `defineTool`, and `sqlite` from `@larkxai/react-native`. There is no `/native` entry and no compatibility wrapper for `createEngine`, `defineWorkflow`, or `createNodeEngine`.

`@larkxai/core`, `@larkxai/agent`, `@larkxai/storage-memory`, `@larkxai/storage-sqlite`, and `@larkxai/testing` are no longer published from this repository. Existing npm versions stay published. Open a new SQLite file. This runtime does not migrate or delete a database created by the TypeScript engine.

`@larkxai/telemetry` keeps the metadata batch contract. It is not connected to the C++ journal. Native telemetry export is a later milestone.
