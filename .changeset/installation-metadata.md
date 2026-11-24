---
"@larkxai/telemetry": patch
---

Add optional installation metadata to Cloud telemetry batches. The exporter sends only reported technical fields and still omits them from older batches. The installation id stays scoped to the telemetry store.
