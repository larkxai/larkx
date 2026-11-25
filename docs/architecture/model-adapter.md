# Model adapter

A model is an object with `complete(request, context)`. The host calls it when the C++ runtime asks for a model invocation. The runtime does not import a model SDK.

`@larkxai/cactus` implements that function for `cactus-react-native` 1.13.1. One `CactusLM` has one completion queue because `complete` throws when that instance is already generating, and `stop()` has no request id. The adapter is optional. Tests use `scriptedModel` or a hand-written `complete`.

Download and `init` happen before `agent.start`. They are not steps. An interrupted model step retries from the last committed LarkX step. `destroy()` unloads the instance when the screen is finished with it.

Chain-of-thought is not stored. Cactus `thinking` is discarded.
