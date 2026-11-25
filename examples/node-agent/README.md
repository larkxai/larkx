# Node agent

A scripted agent on the shared C++ runtime. It does not download a model and it does not use the network. The same script is the process-termination demo.

```bash
pnpm install
pnpm --filter @larkxai/example-node-agent build
sh packages/react-native/scripts/build-node-addon.sh
node examples/node-agent/dist/main.js --database /tmp/larkx-agent.db --log /tmp/larkx-agent.log
```

Flags:

- `--crash-during model|read_notes|save_report` kills the process with `SIGKILL` inside that call.
- `--resume` opens the same database and continues the run.
- `--non-idempotent` marks `save_report` as non-idempotent. A kill inside that handler leaves the run `BLOCKED`. The process exits 2 and does not call the tool again. Reconcile is required before it can continue.

The model reads the committed history, so a new process does not repeat a decision that was stored. `tests/crash-recovery/native-crash.test.ts` is the automated form of this demo. It is a host process kill, not a phone test.
