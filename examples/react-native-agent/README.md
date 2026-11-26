# React Native agents

One Expo app with two screens, both on the C++ runtime:

- Scripted agent. A fixed model drives the native host and prints the run id, operation ids, and ABI.
- Field inspection. Scripted mode and local Cactus mode. Field notes stay in `larkx-field-data.db`. The run record stays in `larkx-field.db`. Reset does not delete those files.

```bash
pnpm install
pnpm build
pnpm --filter @larkxai/example-react-native-agent start
```

Expo Go cannot load `LarkXNativeCore` or Cactus. Use a development build:

```bash
pnpm --filter @larkxai/example-react-native-agent exec expo prebuild
pnpm --filter @larkxai/example-react-native-agent exec expo run:ios
pnpm --filter @larkxai/example-react-native-agent exec expo run:android
```

This repository has not executed that build on a simulator or a phone. The checklist is [docs/validation/on-device-agent.md](../../docs/validation/on-device-agent.md).

Scripted field runs use agent `field-assistant-scripted`. Local runs use `field-assistant-local`. Resume a run with the same mode. Prepare downloads and initializes one Cactus instance. Leaving the screen calls `destroy()`. Those model calls have not been executed on a device.

Telemetry stays off until a project id and an `lkx_ing_` key are applied. The status line shows the phase, pending count, last sync, and last error code. Flush sends the pending batch. The inspection still runs when that request fails. Current LarkX Cloud rejects storage schema 3, so point the optional endpoint at a collector that accepts the contract in [docs/cloud-native-telemetry.md](../../docs/cloud-native-telemetry.md) until Cloud does.

The field screen can register `procurement-agent` when an endpoint is set. Use the computer's LAN address, such as `http://192.168.1.20:8787`, while `examples/remote-task` is running. `localhost` points at the phone. The network control reports waiting for a network without failing the run. The timeline marks hybrid steps separately from local steps and shows the client operation id and the remote task id. Cancel uses `run.cancel()`. A blocked unknown delegation can be reconciled from the existing buttons. This screen has not been run on a phone.
