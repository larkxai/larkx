# @larkxai/react-native

React Native SDK for the shared C++ runtime.

```typescript
import { createRuntime, defineTool, sqlite } from "@larkxai/react-native";

const runtime = await createRuntime({ storage: sqlite() });
const agent = runtime.createAgent({
  name: "personal-assistant",
  version: 1,
  model,
  instructions: "Help the user.",
  tools: [
    defineTool({
      name: "read_notes",
      description: "Read locally stored notes",
      schema: { type: "object", properties: {} },
      effects: "idempotent",
      handler: () => ({ notes: ["Example note"] }),
    }),
  ],
});
const run = await agent.start({ message: "Summarize my notes" });
console.log(await run.result());
await runtime.close();
```

`sqlite()` with no argument stores `larkx.db` under the application document directory. Pass `sqlite("/path/to/agent.db")` to choose a file. The runtime does not delete an existing database.

`createRuntime` requires `NativeModules.LarkXNativeCore`. Expo Go does not load it. Use a development build. There is no JavaScript fallback.

The public surface is `Runtime`, `Agent`, `Run`, `Tool`, `Model`, `sqlite`, `resume`, `reconcile`, and `observe`. `@larkxai/node` exposes the same calls against the same C++ state machine.

Peers: `react`, `react-native`, and `expo-file-system`.
