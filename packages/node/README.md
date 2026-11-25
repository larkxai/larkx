# @larkxai/node

Node.js SDK for the shared C++ runtime. It uses the same state machine as `@larkxai/react-native`.

```typescript
import { createRuntime, defineTool, scriptedModel, sqlite } from "@larkxai/node";

const runtime = await createRuntime({ storage: sqlite("./agent.db") });
const agent = runtime.createAgent({
  name: "notes",
  version: 1,
  model: scriptedModel([{ message: "Done", finish: "stop", calls: [] }]),
  instructions: "Be brief.",
  tools: [],
});
const run = await agent.start({ message: "Summarize my notes" });
console.log(await run.result());
await runtime.close();
```

Build the native addon from the repository before the first call:

```bash
sh packages/react-native/scripts/build-node-addon.sh
```

The addon is the Node binding of the C++ host session. This package does not contain a TypeScript execution engine. Node.js 22.13 or newer is required.
