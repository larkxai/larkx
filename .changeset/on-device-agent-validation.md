---
"@larkxai/react-native": patch
"@larkxai/cactus": patch
---

Schedule the native host driver from agent.start, and make run.result wait. List persisted runs from the C++ store. Preserve embedded NUL across the iOS, Android, Node, and SQLite boundaries. Add cactusHostModel for the native host's JSON model request. Queue completions per Cactus model so one cancellation does not stop another model. Keep scripted and local field agents on distinct identities, and reject recovery with a different model.
