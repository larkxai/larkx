---
"@larkxai/react-native": patch
---

Reject redirects in the React Native HTTP transport, and keep a permanently rejected telemetry run from blocking export of other runs. A rejected run stays rejected across restart. A manual flush retries a quota rejection only. The request timeout covers the whole attempt.
