# Node agent

Internal Node host for a scripted agent on the shared C++ runtime. It is not a published SDK. It does not download a model and it does not use the network. The same script is the process-termination demo.

```bash
pnpm install
pnpm --filter @larkxai/example-node-agent build
sh packages/node/scripts/build-native.sh
node examples/node-agent/dist/main.js --database /tmp/larkx-agent.db --log /tmp/larkx-agent.log
```

Flags:

- `--crash-during model|read_notes|save_report|after_save` kills the process with `SIGKILL`. `model` kills before the decision is committed. `save_report` kills after the tool has recorded its effect and before the runtime commits the result. `after_save` kills on the next model call, after that tool result is committed.
- `--resume` opens the same database and continues the run.
- `--non-idempotent` marks `save_report` as non-idempotent. A kill inside that handler leaves the run `BLOCKED`. The process exits 2 and does not call the tool again. Reconcile is required before it can continue.

`save_report` records its operation id in a sibling effects file and skips an id it has already recorded. The model reads the committed history, so a new process does not repeat a decision that was stored. `tests/crash-recovery/native-crash.test.ts` is the automated form of this demo. It is a host process kill, not a phone test.
