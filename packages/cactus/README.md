# @larkx/cactus

Optional Cactus adapter for `@larkx/agent`. The agent package does not import this package.

The adapter is written against `cactus-react-native` 1.13.1:

- `new CactusLM({ model })`
- `download({ onProgress })`
- `init()`
- `complete({ messages, tools, options })`
- `stop()`
- `getModelName()`

Download and `init` are not agent steps. Call them before `agent.start`. `complete` also initializes a model that is already downloaded. That is the SDK's documented behavior, and the agent still treats one completion as one durable step.

## Model

The demo requests `qwen3-0.6b`. The SDK default quantization is `int8`, so `getModelName()` reports a name such as `qwen3-0.6b-int8`. The published API reference does not give a fixed download size or a minimum RAM figure. Completions can report `ramUsageMb` at runtime. The class defaults used by current Cactus builds are a 2048-token context and 512 completion tokens. This adapter sends `maxTokens: 512` and does not pass an undocumented context option.

The adapter sets `telemetryEnabled: false`, `enableThinking: false`, `useVad: false`, `forceTools: false`, and `confidenceThreshold: 0`. `toolRagTopK` is the number of registered tools so a short tool list is not reduced to the SDK default of 2. A `cloudHandoff` result is a permanent local failure. The response is not sent anywhere.

Cactus messages are `system`, `user`, and `assistant` only. Tool results are sent as user messages. There is no tool role in the 1.13.1 message type. `thinking` is discarded and is not written into the LarkX step.

`stop()` is called when the step's `AbortSignal` aborts. That stops the current generation. It does not resume from a previous token, and it does not restore a KV cache. An interrupted model step retries from the last committed LarkX step.

## Native build

`cactus-react-native` 1.13.1 depends on `react-native-nitro-modules` `^0.33.9`. It does not run in Expo Go. The M2 workflow demo is not evidence that Expo Go can load Cactus. Use a development build (`expo run:android` or `expo run:ios`). This repository has not executed that build on a device or an emulator.

Import `@larkx/cactus/adapter` in Node tests. That entry does not load the native module. The package root loads it.
