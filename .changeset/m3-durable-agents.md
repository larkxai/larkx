---
"@larkxai/agent": patch
"@larkxai/cactus": patch
"@larkxai/core": patch
"@larkxai/react-native": patch
---

Add a durable agent loop and a Cactus adapter on the existing workflow engine. Agents register their workflow after the engine is created, and each model decision and tool call is one local step.
