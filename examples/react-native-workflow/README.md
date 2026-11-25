# React Native agents

One Expo app with two screens, both on the C++ runtime:

- Scripted agent. A fixed model drives the native host and prints the run id, operation ids, and ABI.
- Field inspection. Scripted mode and local Cactus mode. Field notes stay in `larkx-field-data.db`. The run record stays in `larkx-field.db`. Reset does not delete those files.

```bash
pnpm install
pnpm build
pnpm --filter @larkxai/example-react-native-workflow start
```

Expo Go cannot load `LarkXNativeCore` or Cactus. Use a development build:

```bash
pnpm --filter @larkxai/example-react-native-workflow exec expo prebuild
pnpm --filter @larkxai/example-react-native-workflow exec expo run:ios
pnpm --filter @larkxai/example-react-native-workflow exec expo run:android
```

This repository has not executed that build on a simulator or a phone. The checklist is [docs/validation/on-device-agent.md](../../docs/validation/on-device-agent.md).

Scripted field runs use agent `field-assistant-scripted`. Local runs use `field-assistant-local`. Resume a run with the same mode. Prepare downloads and initializes one Cactus instance. Leaving the screen calls `destroy()`. Those model calls have not been executed on a device.
