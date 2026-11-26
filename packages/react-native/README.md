# @larkxai/react-native

React Native SDK for the shared C++ runtime.

```bash
npm install @larkxai/react-native
```

```typescript
import { createRuntime, defineTool, scriptedModel, sqlite } from "@larkxai/react-native";

const runtime = await createRuntime({ storage: sqlite() });
const agent = runtime.createAgent({
  name: "personal-assistant",
  version: 1,
  model: scriptedModel([{ message: "Done.", finish: "stop", calls: [] }]),
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

`remoteAgent` registers an independent remote agent. Pass its endpoint as a LAN URL when the phone and the reference fixture are on the same network. Do not use `localhost` for that path. Declare `dedupe` and `lookup` only when that peer implements them. The shared host aborts each request with `AbortController` and `setTimeout`; it does not use `AbortSignal.timeout` or `AbortSignal.any`. The protocol is [docs/architecture/remote-delegation.md](../../docs/architecture/remote-delegation.md).

`createRuntime` requires `NativeModules.LarkXNativeCore`. Expo Go does not load it. Use a development build. There is no JavaScript fallback and no `/native` entry.

The package carries the JavaScript bundle, TypeScript declarations, the C++ host session, the C ABI headers, CMake, the Android and iOS projects, the podspec, and Expo autolinking. `prepack` copies the shared C++ sources into `vendor/larkx`, so a published install does not need this repository's directory layout.

Optional Cactus:

```typescript
import { cactusModel } from "@larkxai/react-native/cactus";
```

Install `cactus-react-native` 1.13.1 and `react-native-nitro-modules` 0.33.9 or newer only if you import that subpath. The root import does not load them. Call `download()` and `init()` before `agent.start`. The supported demo model name is `qwen3-0.6b`.

Peers: `react`, `react-native`, and `expo-file-system`. Cactus and Nitro are optional peers.
