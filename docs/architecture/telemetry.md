# Telemetry

`@larkxai/telemetry` builds metadata-only batches and posts them to an optional LarkX Cloud endpoint. The C++ runtime does not import it and does not produce a journal document for it. Connecting that export is a later milestone. A run finishes, fails, or blocks whether or not a batch is acknowledged. Cloud does not retry steps, reconcile unknown outcomes, or cancel runs.

Callers that already have a `JournalDocument` can pass a `JournalSource` to `createCloudTelemetry`. The document is a metadata projection: statuses, names, versions, step keys, effect classes, operation ids, attempt numbers, error codes, and timestamps. It does not include prompts, tool results, or the owner id.

The batch contract is [the cloud observability spec](../cloud-observability-spec.md). Sections of that spec that describe the TypeScript engine are historical. Ingestion still lives in `larkxai/cloud`.
