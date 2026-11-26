# @larkxai/node

Private Node.js host for the shared C++ runtime. It is not published and it is not an application SDK. Use `@larkxai/react-native` in an app. This package exists so crash recovery, delegation, and the native addon can be tested without a mobile build.

From this repository:

```bash
sh packages/node/scripts/build-native.sh
```

The build needs Node.js 22.13 or newer, CMake 3.20 or newer, a C++20 compiler, SQLite 3 development headers, and Node.js headers (`node_api.h`). Source builds cover Linux x64 and macOS arm64/x64. Prebuilt binaries are not published. Windows is not supported. A missing addon throws an error that repeats these requirements.

The tests import the workspace package:

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

In this repository the build command is `sh packages/node/scripts/build-native.sh`. The script vendors nothing during a local build: CMake uses `native/` and `packages/react-native/cpp`. `prepack` copies those sources into the tarball so an installed package does not need the monorepo.

`remoteAgent` is also exported here so the Node delegation tests can run. Application code imports it from `@larkxai/react-native`. The protocol is [docs/architecture/remote-delegation.md](../../docs/architecture/remote-delegation.md). The internal pair of processes is [examples/node-hybrid](../../examples/node-hybrid/README.md) and [examples/remote-task](../../examples/remote-task/README.md).

This package does not contain a TypeScript execution engine and does not depend on React Native, Expo, or Cactus.
