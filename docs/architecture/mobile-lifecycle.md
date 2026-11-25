# Mobile lifecycle

`@larkxai/react-native` is the React Native binding of the C++ runtime. It is not a second runner.

```typescript
import { createRuntime, defineTool, sqlite } from "@larkxai/react-native";

const runtime = await createRuntime({ storage: sqlite() });
```

`sqlite()` with no path uses the application document directory through `expo-file-system`. Pass a path to choose the file. Expo Go does not load `LarkXNativeCore`. Use a development build.

`bindNativeAppState` tells the host when the app leaves the foreground so in-flight work can pause. Closing the runtime drops the in-process session and leaves the database on disk. Register the agent again after relaunch, then `runtime.resume(runId)`.

A Node test of this package is not a phone run. The open checklist is [docs/validation/on-device-agent.md](../validation/on-device-agent.md).
