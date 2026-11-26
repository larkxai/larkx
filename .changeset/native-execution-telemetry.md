---
"@larkxai/react-native": minor
---

Add opt-in execution telemetry. `larkxCloud({ projectId, apiKey })` exports metadata from the native journal, and `{ exporter }` accepts another sink. The default runtime does not transmit telemetry. `flushTelemetry` and `telemetryStatus` report delivery. Prompts, model text, tool arguments, and tool results are not included.
