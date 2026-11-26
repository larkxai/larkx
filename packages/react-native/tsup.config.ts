import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts", "src/cactus.ts"],
  format: ["esm"],
  dts: true,
  clean: true,
  sourcemap: true,
  target: "es2022",
  splitting: false,
  external: [
    "react",
    "react-native",
    "expo-file-system",
    "cactus-react-native",
    "react-native-nitro-modules",
  ],
  noExternal: ["@larkxai/host", "@larkxai/protocol", "@larkxai/cactus", "@larkxai/telemetry"],
});
