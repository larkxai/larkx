# @larkx/storage-memory

```bash
npm install @larkx/storage-memory
```

In-memory implementation of the LarkX storage contract.

Runs, steps, attempts, events, outbox rows, and artifact metadata live in the process heap. They are discarded when the process exits or when `close()` is called. Use this adapter for tests and local experiments. Use the SQLite adapter when a workflow must survive process termination.
