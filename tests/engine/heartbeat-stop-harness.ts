import { createEngine, defineWorkflow } from "@larkx/core";
import { createMemoryStorage } from "@larkx/storage-memory";

const workflow = defineWorkflow({
  name: "tick",
  version: 1,
  async run(ctx) {
    return ctx.step("once", {
      execution: "local",
      effects: "pure",
      run: () => "done",
    });
  },
});

const engine = createEngine({
  storage: createMemoryStorage(),
  workflows: [workflow],
  leaseMs: 60_000,
  heartbeat: true,
});

const handle = await engine.start(workflow, { id: "tick-1", input: {} });
const output = await handle.result();
if (output !== "done") {
  throw new Error("unexpected output");
}
await engine.close();
