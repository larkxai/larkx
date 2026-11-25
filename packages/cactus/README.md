# @larkxai/cactus

```bash
npm install @larkxai/cactus
```

Optional Cactus adapter for `@larkxai/agent`. The agent package does not import this package.

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

`CactusLM.complete()` throws if that instance is already generating. `stop()` takes no request id and stops the active generation on that instance. The adapter queues completions per model instance. Cancelling a completion that is still waiting does not call `stop()`. Cancelling the active completion calls `stop()` for that instance only. A second `CactusLM` has its own queue. `stop()` does not resume from a previous token and does not restore a KV cache. An interrupted model step retries from the last committed LarkX step. `destroy()` unloads the instance. Call it when the screen is finished with the model.

## Native build

`cactus-react-native` 1.13.1 depends on `react-native-nitro-modules` `^0.33.9`. It does not run in Expo Go. The M2 workflow demo is not evidence that Expo Go can load Cactus. Use a development build (`expo run:android` or `expo run:ios`). This repository has not executed that build on a device or an emulator.

Import `@larkxai/cactus/adapter` in Node tests. That entry does not load the native module. The package root loads it.

`cactusHostModel` in that adapter entry accepts the native host's JSON model request and returns a LarkX model response. It does not plan steps. Download and `init` stay outside the run. A failed completion is retryable. A cloud handoff is a permanent local error. Structured output is not advertised. Cancellation of the active completion calls `stop()` on that model instance. A queued completion is cancelled without calling `stop()`.
