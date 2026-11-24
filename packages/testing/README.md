# @larkx/testing

```bash
npm install @larkx/testing
```

Test utilities for LarkX adapters.

`createFakeClock` records sleepers until a test advances time. `createAutoClock` moves time forward when something sleeps, which keeps retry tests deterministic. Do not combine the auto clock with lease heartbeats: the heartbeat would advance time as fast as the event loop allows.

`storageConformanceCases` is the adapter contract. Memory and SQLite both run it. A new driver should run the same cases against a durable database, including a case that reopens the database in a new process.
