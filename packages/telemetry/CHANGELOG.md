# @larkxai/telemetry

## 0.1.2

### Patch Changes

- @larkxai/core@0.1.2
- @larkxai/protocol@0.1.2
- @larkxai/storage-sqlite@0.1.2

## 0.1.1

### Patch Changes

- edc8cac: Add optional installation metadata to Cloud telemetry batches. The exporter sends only reported technical fields and still omits them from older batches. The installation id stays scoped to the telemetry store.
- 84909e8: Add an optional metadata-only Cloud exporter. Workflow and agent runs use the existing journal. The engine does not wait on ingestion, and step outputs stay on the device.
- 83a4653: Scope Cloud telemetry on Hermes without `crypto.subtle` or `crypto.randomUUID`. React Native passes `expo-crypto` for the installation id and the destination hash.
- Updated dependencies [2864423]
- Updated dependencies [4a42ea8]
- Updated dependencies [84909e8]
  - @larkxai/core@0.1.1
  - @larkxai/storage-sqlite@0.1.1
  - @larkxai/protocol@0.1.1
