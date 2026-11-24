# Guide: Node.js workflow

This guide uses the example in `examples/node-workflow`. Build first with `pnpm install` and `pnpm build` from the repository root.

## Complete a run

```bash
pnpm --filter @larkxai/example-node-workflow start -- \
  --database /tmp/larkx-demo.db \
  --log /tmp/larkx-demo.log
```

The process prints JSON. `status` is `COMPLETED` and `output.normalized` is `hello larkx` for the default text. Exit code 0 means completed.

## Kill after a committed step

```bash
rm -f /tmp/larkx-demo.db /tmp/larkx-demo.log /tmp/larkx-demo.db.larkx-owner.json
pnpm --filter @larkxai/example-node-workflow start -- \
  --database /tmp/larkx-demo.db \
  --log /tmp/larkx-demo.log \
  --crash-after-commit normalize
pnpm --filter @larkxai/example-node-workflow start -- \
  --database /tmp/larkx-demo.db \
  --log /tmp/larkx-demo.log
```

The first command ends with `SIGKILL` after `normalize` is stored. The log file then contains `normalize` once. The second command appends `count` and `summarize` and does not append `normalize` again.

`--crash-during count` and `--crash-before-commit count` kill before a count result exists. The next process runs `count` again. `normalize` stays at one line.

## Refuse an uncertain charge

```bash
pnpm --filter @larkxai/example-node-workflow start -- \
  --database /tmp/larkx-charge.db \
  --log /tmp/larkx-charge.log \
  --workflow charge-once \
  --crash-during charge
pnpm --filter @larkxai/example-node-workflow start -- \
  --database /tmp/larkx-charge.db \
  --log /tmp/larkx-charge.log \
  --workflow charge-once
```

The second process exits 2. The JSON status is `BLOCKED`. The log still has a single `charge` line. The example does not reconcile that run. Application code that can prove the charge did not happen would call `reconcileStep` and then `resume`.

## In application code

`createNodeEngine({ database, workflows })` from `@larkxai/node` is the supported constructor. On the next launch, call `recover()` or `resume(id)` with the same database file. You do not need the original `RunHandle`.

The database file is not encrypted. Put it somewhere the application already treats as private.
