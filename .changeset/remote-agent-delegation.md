---
"@larkxai/node": minor
"@larkxai/react-native": minor
---

A local agent can delegate a task to an independent remote agent. The C++ runtime stores the operation before the host sends it, keeps the client operation id distinct from the remote task id, and recovers a lost acknowledgement from the capabilities declared for that delegation.

`remoteAgent` is exported from both public SDKs. The HTTP task protocol, the reference fixture, and the Node hybrid example are in this repository. A2A is not included.
