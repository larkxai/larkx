# Guide: React Native workflow

The demo and the manual interruption steps are in [examples/react-native-workflow/README.md](../../examples/react-native-workflow/README.md).

The app uses `openReactNativeEngine` and the same `defineWorkflow` functions as Node. Build the workspace first so Metro loads the package `dist` entries:

```bash
pnpm install
pnpm build
pnpm --filter @larkx/example-react-native-workflow start
```

CI does not boot an emulator. The Node tests under `tests/react-native` are the automated half of M2. They are not an Expo SQLite run.
