import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  dts: true,
  clean: true,
  sourcemap: true,
  target: "node22",
  platform: "node",
  splitting: false,
  noExternal: ["@larkxai/host", "@larkxai/protocol", "@larkxai/telemetry"],
});
