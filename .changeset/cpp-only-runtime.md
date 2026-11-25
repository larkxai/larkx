---
"@larkxai/node": minor
"@larkxai/react-native": minor
---

Ship one C++ runtime behind two public SDKs. `@larkxai/node` and `@larkxai/react-native` bundle the host driver and no longer depend on separately published packages.

`@larkxai/host`, `@larkxai/protocol`, `@larkxai/cactus`, and `@larkxai/telemetry` stay in the repository as private modules. Existing npm versions of those names, and of `@larkxai/core`, `@larkxai/agent`, `@larkxai/storage-memory`, `@larkxai/storage-sqlite`, and `@larkxai/testing`, stay published. This release does not unpublish them.

Import `createRuntime`, `defineTool`, `scriptedModel`, and `sqlite` from `@larkxai/node` or `@larkxai/react-native`. Cactus is `@larkxai/react-native/cactus`. There is no `/native` entry and no compatibility wrapper for the TypeScript workflow engine.

Open a new SQLite file. This runtime does not migrate or delete a database created by the TypeScript engine. A file that already has LarkX tables and no native schema version is rejected.
