# @larkx/core

Platform-independent durable workflow engine.

`createEngine` runs registered TypeScript workflows against a `WorkflowStorage` adapter. The engine replays workflow control flow from persisted inputs and completed step results. It does not restore a JavaScript stack.

Local steps are implemented. Cloud and hybrid steps are part of the public type surface and fail with a stable error until a dispatcher exists. The default data policy is `device-only`.

This package does not import Node.js, a database driver, or a model provider.
