# @larkxai/core

```bash
npm install @larkxai/core
```

Platform-independent durable workflow engine.

`createEngine` runs registered TypeScript workflows against a `WorkflowStorage` adapter. The engine replays workflow control flow from persisted inputs and completed step results. It does not restore a JavaScript stack. `engine.register(workflow)` adds a definition after construction. Registering the same object again is a no-op. A second object for the same name and version is rejected.

Local steps are implemented. Cloud and hybrid steps are part of the public type surface and fail with a stable error until a dispatcher exists. The default data policy is `device-only`.

`readJournal(runId)` returns the metadata projection used by `@larkxai/telemetry`: statuses, names, versions, step keys, attempts, and journal events. It does not return workflow input, step input, step output, error text, or the owner id.

This package does not import Node.js, a database driver, or a model provider.
