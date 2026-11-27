# Field inspection

The Expo app is a fictional industrial inspection assistant. It is a demonstration of the LarkX runtime, not a commercial inspection product. Device checks are in [docs/validation/on-device-agent.md](../../docs/validation/on-device-agent.md). The recording sequence is in [docs/demo/flagship-mobile-demo.md](../../docs/demo/flagship-mobile-demo.md).

This example depends on `workspace:*`. At this revision that package is `@larkxai/react-native` 0.4.1, the same version as the published npm release. The application builds against this checkout, not against a second copy downloaded into `node_modules`. A new application outside this repository installs the published tarball with `npm install @larkxai/react-native@0.4.1`.

The home screen is the inspection. Settings holds the model, the remote endpoint, Cloud telemetry, and the developer controls. The scripted runtime lab is behind Settings.

```bash
pnpm install
pnpm build
pnpm --filter @larkxai/example-react-native-agent start
```

Node.js 22.13 or newer and pnpm 10.33.4. Expo SDK 58. React Native 0.88. Expo Go cannot load `LarkXNativeCore` or Cactus. Use a development build:

```bash
pnpm --filter @larkxai/example-react-native-agent exec expo prebuild
pnpm --filter @larkxai/example-react-native-agent exec expo run:ios
pnpm --filter @larkxai/example-react-native-agent exec expo run:android
```

This repository has not executed that build on a simulator or a phone.

Scripted test mode uses agent `field-assistant-scripted`. The tool sequence is fixed. It is not on-device inference. Local AI mode uses `field-assistant-local` and `qwen3-0.6b` through Cactus. Download the model from Settings before the recorded run. Resume a run with the same mode. Leaving the screen calls `destroy()` on the model.

The inspection database is `larkx-field.db`. Application tool rows, including saved reports, are in `larkx-field-data.db`. Starting another inspection does not delete those files.

Telemetry stays off until a project id and an `lkx_ing_` key are applied. The key is written to the platform keystore, not to SQLite. Apply it before the recorded run. Earlier runs are not backfilled. The demo flush interval is 3 seconds. The SDK default stays 15 seconds. Do not point a recorded run at production until an authorized project has accepted one real batch. A local collector that accepts schema 3 is the development destination.

Remote research uses A2A by default. Point it at `examples/langgraph-a2a-agent` on the computer's LAN address, such as `http://192.168.1.20:8791`. `localhost` on the phone is the phone. The runtime network switch is an explicit input. Airplane mode does not flip it by itself.

The recorded script reads notes, specifications, and previous inspections, optionally delegates supplier research, and saves one report. `record_part_replacement` stays registered for an unknown-outcome check. The script does not call it.
