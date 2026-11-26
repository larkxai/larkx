# Node hybrid field inspection

Internal Node host for a local agent that reads inspection notes, looks up a local specification, delegates supplier research, and saves the report. It is not the public SDK and it is not the validated phone demonstration. The remote task lives in `examples/remote-task`. No LarkX Cloud account is required.

```bash
pnpm install
pnpm --filter @larkxai/example-remote-task build
pnpm --filter @larkxai/example-node-hybrid build
node examples/remote-task/dist/main.js --port 8787 --data /tmp/larkx-tasks.json --delay-ms 2000
```

In another shell:

```bash
node examples/node-hybrid/dist/main.js \
  --database /tmp/larkx-field.db \
  --log /tmp/larkx-field.log \
  --endpoint http://127.0.0.1:8787
```

Stop the local process and continue the same run:

```bash
node examples/node-hybrid/dist/main.js \
  --database /tmp/larkx-field.db \
  --log /tmp/larkx-field.log \
  --endpoint http://127.0.0.1:8787 \
  --crash-during during-poll
```

`during-poll` keeps the local process in a status poll while the fixture delays the result. Stop that process with `kill -9 <pid>`. The fixture keeps the task. Then:

```bash
node examples/node-hybrid/dist/main.js \
  --database /tmp/larkx-field.db \
  --log /tmp/larkx-field.log \
  --endpoint http://127.0.0.1:8787 \
  --resume
```

`--crash-during` also accepts `before-submit`, `after-submit`, `after-accept`, `before-commit`, and `after-commit`. Each one stops the local process with `SIGKILL`. `--offline` queues the delegation until a later `--resume` without that flag. The default `--capabilities full` is an explicit declaration that this fixture dedupes, looks up, polls, and cancels. `--capabilities none` declares no lookup and no dedupe, so a lost acknowledgement blocks for `--reconcile complete` or `--reconcile fail`.

The log is the execution history. `GET http://127.0.0.1:8787/_tasks` shows the fixture's tasks. A completed local run prints the operation id and the remote task id. They are different.
