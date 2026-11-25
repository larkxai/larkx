import { createRequire } from "node:module";
import process from "node:process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import type { HostTransport } from "./runtime.js";

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
  return join(dirname(fileURLToPath(import.meta.url)), "../../build/larkx_native.node");
}

export function createNodeTransport(): HostTransport {
  const path = addonPath();
  if (!existsSync(path)) {
    throw new Error(
      `The LarkX native addon is not built at ${path}. Run packages/react-native/scripts/build-node-addon.sh.`,
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
