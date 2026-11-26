---
"@larkxai/react-native": minor
---

A local agent can delegate a task to an independent remote agent. The C++ runtime stores the operation before the host sends it, keeps the client operation id distinct from the remote task id, and recovers a lost acknowledgement only from the capabilities declared for that delegation. Dedupe and lookup stay off until declared. Redirects are not followed, and an offline lookup does not treat a possibly sent operation as never sent.

`remoteAgent` is exported from `@larkxai/react-native`. The HTTP task protocol remains the generic transport and the test foundation. A2A is the planned interoperability protocol and is not implemented. `@larkxai/node` stays in the workspace for tests and is not published.
