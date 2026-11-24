---
"@larkxai/core": patch
"@larkxai/react-native": patch
"@larkxai/telemetry": patch
---

Add an optional metadata-only Cloud exporter. Workflow and agent runs use the existing journal. The engine does not wait on ingestion, and step outputs stay on the device.
