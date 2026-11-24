# Durable Node.js workflow

This example runs a three-step workflow on SQLite and shows that a restarted process does not call handlers whose results were already committed.

The steps are:

1. `normalize` — pure
2. `count` — pure
3. `summarize` — idempotent, receives a stable `operationId`

`charge-once` is a separate one-step workflow whose effect is `non-idempotent`. If the process dies while that step is running, recovery blocks the run instead of charging again.

## Run

From the repository root, after `pnpm install` and `pnpm build`:

```bash
pnpm --filter @larkxai/example-node-workflow start -- --database /tmp/larkx-demo.db --log /tmp/larkx-demo.log
```

Kill the process after the first committed step, then start it again with the same database and log:

```bash
pnpm --filter @larkxai/example-node-workflow start -- \
  --database /tmp/larkx-demo.db \
  --log /tmp/larkx-demo.log \
  --crash-after-commit normalize
```

```bash
pnpm --filter @larkxai/example-node-workflow start -- --database /tmp/larkx-demo.db --log /tmp/larkx-demo.log
```

The second invocation log contains `normalize` once. `count` and `summarize` run on the second process.

Other crash points:

- `--crash-during count` kills inside the handler, before a result exists.
- `--crash-before-commit count` kills after the handler returns and before the result is stored.
- `--workflow charge-once --crash-during charge` leaves the run `BLOCKED` on the next start.

Node may print an experimental warning for its built-in SQLite module. That warning comes from Node, not from a failure of the workflow.

This example does not use a network, a model provider, or LarkX Cloud.
