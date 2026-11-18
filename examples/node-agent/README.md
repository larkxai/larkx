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

Cloud export is optional and off by default. Set both variables to send metadata after the agent finishes. The script still prints the local result when Cloud is down. Do not commit the key.

```bash
export LARKX_CLOUD_ENDPOINT=https://cloud.example
export LARKX_INGESTION_KEY=lkx_ing_...
node examples/node-agent/dist/main.js /tmp/larkx-agent.db
```

A file database also stores the export checkpoint in `/tmp/larkx-agent.db.telemetry`. `:memory:` keeps that checkpoint in process memory. The printed `cloud` field is the flush phase. Prompts and tool results stay in the workflow database.
