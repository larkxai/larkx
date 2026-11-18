# Node agent example

A scripted renovation agent on `createNodeEngine`. It does not download a model and it does not use the network. The model returns the same tool calls for the same committed tool count, which is what the process-death tests rely on.

```bash
pnpm --filter @larkx/example-node-agent build
pnpm --filter @larkx/example-node-agent start
```

Pass a database path to keep the run:

```bash
node examples/node-agent/dist/main.js /tmp/larkx-agent.db
```

The process prints the final message and the step keys. SIGKILL coverage is `tests/agent/restart.test.ts`, not this script. That test kills the process during a model step, during an idempotent tool, and during a non-idempotent tool, then opens the same SQLite file.
