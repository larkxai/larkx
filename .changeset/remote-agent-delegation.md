---
"@larkxai/node": minor
"@larkxai/react-native": minor
---

A local agent can delegate a task to an independent remote agent. The C++ runtime stores the operation before the host sends it, keeps the client operation id distinct from the remote task id, and recovers a lost acknowledgement only from the capabilities declared for that delegation. Dedupe and lookup stay off until declared. Redirects are not followed, and an offline lookup does not treat a possibly sent operation as never sent.

`remoteAgent` is exported from both public SDKs. The HTTP task protocol, the reference fixture, and the Node hybrid example are in this repository. A2A is not included.
