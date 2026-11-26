# React Native agent

The maintained Expo example is [examples/react-native-agent](../../examples/react-native-agent/README.md). It runs a scripted agent, a Cactus agent, and the field inspection assistant on the C++ runtime. Expo Go cannot load the native module.

Field inspection can apply an optional Cloud project id and `lkx_ing_` key, show whether telemetry is enabled, and flush pending metadata. Leave those fields empty and the example does not transmit telemetry. The screen keeps working when the collector is unreachable. The Cloud dashboard is a later change.
