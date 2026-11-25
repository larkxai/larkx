# Remote dispatch

Not implemented. The C++ runtime does not send remote work.

A later milestone may persist an outbox row and a stable operation id before the device asks an independently deployed agent to continue. Lost acknowledgements must dedupe on that operation id or block for reconcile. This repository does not host a coordinator or a worker fleet. See [ROADMAP.md](../../ROADMAP.md).

`device-only` is the default. A remote request has to be allowed explicitly. The protocol types for a remote payload remain in `@larkxai/protocol` so that later work has a contract. The current runtime does not write them.
