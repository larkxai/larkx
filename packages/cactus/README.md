# @larkxai/cactus

Optional Cactus adapter. This package is private. Application code imports `cactusModel` from `@larkxai/react-native/cactus`. The C++ runtime does not import this package, and `@larkxai/node` does not depend on it.

The adapter is written against `cactus-react-native` 1.13.1:

- `new CactusLM({ model })`
- `download({ onProgress })`
- `init()`
- `complete({ messages, tools, options })`
- `stop()`
- `getModelName()`

Download and `init` are not agent steps. Call them before `agent.start`. `complete` also initializes a model that is already downloaded.

## Model

The demo requests `qwen3-0.6b`. The SDK default quantization is `int8`, so `getModelName()` reports a name such as `qwen3-0.6b-int8`. The published API reference does not give a fixed download size or a minimum RAM figure. Completions can report `ramUsageMb` at runtime. This adapter sends `maxTokens: 512` and does not pass an undocumented context option.

The adapter sets `telemetryEnabled: false`, `enableThinking: false`, `useVad: false`, `forceTools: false`, and `confidenceThreshold: 0`. `toolRagTopK` is the number of registered tools so a short tool list is not reduced to the SDK default of 2. A `cloudHandoff` result is a permanent local failure. The response is not sent anywhere.

Cactus messages are `system`, `user`, and `assistant` only. Tool results are sent as user messages. `thinking` is discarded and is not written into the LarkX step.

`CactusLM.complete()` throws if that instance is already generating. `stop()` takes no request id and stops the active generation on that instance. The adapter queues completions per model instance. Cancelling a completion that is still waiting does not call `stop()`. Cancelling the active completion calls `stop()` for that instance only. A second `CactusLM` has its own queue. An interrupted model step retries from the last committed LarkX step. `destroy()` unloads the instance.

## Native build

`cactus-react-native` 1.13.1 depends on `react-native-nitro-modules`. It does not run in Expo Go. Use a development build. This repository has not executed that build on a device or an emulator.

Import `@larkxai/cactus/adapter` in Node tests. That entry does not load the native module. The package root loads it. `cactusHostModel` accepts the host's model request and returns a model response. It does not plan steps.
