# @larkxai/node

## 0.2.0

### Minor Changes

- e217da5: Ship one C++ runtime behind two public SDKs. `@larkxai/node` and `@larkxai/react-native` bundle the host driver and no longer depend on separately published packages.

  `@larkxai/host`, `@larkxai/protocol`, `@larkxai/cactus`, and `@larkxai/telemetry` stay in the repository as private modules. Existing npm versions of those names, and of `@larkxai/core`, `@larkxai/agent`, `@larkxai/storage-memory`, `@larkxai/storage-sqlite`, and `@larkxai/testing`, stay published. This release does not unpublish them.

  Import `createRuntime`, `defineTool`, `scriptedModel`, and `sqlite` from `@larkxai/node` or `@larkxai/react-native`. Cactus is `@larkxai/react-native/cactus`. There is no `/native` entry and no compatibility wrapper for the TypeScript workflow engine.

  Open a new SQLite file. This runtime writes SQLite `application_id` `0x4C585254` and does not migrate or delete a database created by the TypeScript engine or by an earlier native preview. A file with any other id is rejected.

## 0.1.2

### Patch Changes

- @larkxai/core@0.1.2
- @larkxai/protocol@0.1.2
- @larkxai/storage-sqlite@0.1.2

## 0.1.1

### Patch Changes

- Updated dependencies [2864423]
- Updated dependencies [4a42ea8]
- Updated dependencies [84909e8]
  - @larkxai/core@0.1.1
  - @larkxai/storage-sqlite@0.1.1
  - @larkxai/protocol@0.1.1
