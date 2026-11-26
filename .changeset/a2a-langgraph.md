---
"@larkxai/react-native": minor
---

Add A2A protocol 1.0 to `remoteAgent` and `run.provideInput` for a remote agent that asks for more information. The HTTP task transport is unchanged. A lost A2A acknowledgement still blocks the parent when the task id was never stored.
