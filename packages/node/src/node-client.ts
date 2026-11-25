import { createRequire } from "node:module";
import process from "node:process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import type { HostTransport } from "@larkxai/host";

interface NativeSession {
  invoke(method: string, argsJson: string): string;
}

interface NativeAddon {
  createSession(): NativeSession;
}

const require = createRequire(import.meta.url);

function addonPath(): string {
  const override = process.env.LARKX_NATIVE_ADDON;
  if (override !== undefined && override.length > 0) {
    return override;
  }
  return join(dirname(fileURLToPath(import.meta.url)), "../build/larkx_native.node");
}

export function createNodeTransport(): HostTransport {
  const path = addonPath();
  if (!existsSync(path)) {
    throw new Error(
      [
        `The LarkX native addon is not built (${path}).`,
        "Build it from the installed package:",
        "  sh node_modules/@larkxai/node/scripts/build-native.sh",
        "In this repository the same script is packages/node/scripts/build-native.sh.",
        `This process is ${process.platform} ${process.arch}, Node ${process.version}.`,
        "Requires Node.js 22.13 or newer, CMake 3.20 or newer, a C++20 compiler, SQLite 3 development headers, and Node.js headers (node_api.h).",
        "Prebuilt binaries are not published. Build from source on Linux x64 or macOS arm64/x64. CI compiles this addon on Ubuntu x64. Windows is not supported.",
        "Set LARKX_NATIVE_ADDON to an existing larkx_native.node to use a binary you built elsewhere.",
      ].join("\n"),
    );
  }
  const addon = require(path) as NativeAddon;
  const session = addon.createSession();
  return {
    invoke(method, args) {
      return session.invoke(method, JSON.stringify(args));
    },
  };
}
