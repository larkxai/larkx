import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

import { describe, expect, it } from "vitest";

const root = join(import.meta.dirname, "../..");

describe("packed React Native SDK", () => {
  it("contains the native project and does not depend on workspace packages", () => {
    const packed = mkdtempSync(join(tmpdir(), "larkx-rn-pack-"));
    const build = spawnSync("pnpm", ["--filter", "@larkxai/react-native", "build"], {
      cwd: root,
      encoding: "utf8",
    });
    expect(build.status, build.stderr).toBe(0);
    const pack = spawnSync(
      "pnpm",
      ["--filter", "@larkxai/react-native", "pack", "--pack-destination", packed],
      { cwd: root, encoding: "utf8" },
    );
    try {
      expect(pack.status, pack.stderr).toBe(0);
      const listing = spawnSync("tar", ["-tzf", join(packed, "larkxai-react-native-0.1.2.tgz")], {
        encoding: "utf8",
      });
      expect(listing.status, listing.stderr).toBe(0);
      const files = listing.stdout.split("\n");
      for (const required of [
        "package/dist/index.js",
        "package/dist/index.d.ts",
        "package/dist/cactus.js",
        "package/dist/cactus.d.ts",
        "package/cpp/host_session.cpp",
        "package/android/CMakeLists.txt",
        "package/ios/LarkXNativeCore.mm",
        "package/LarkXNativeCore.podspec",
        "package/react-native.config.js",
        "package/vendor/larkx/abi/include/larkx.h",
        "package/vendor/larkx/core/src/agent.cpp",
      ]) {
        expect(files, required).toContain(required);
      }
      const manifest = spawnSync(
        "tar",
        ["-xOzf", join(packed, "larkxai-react-native-0.1.2.tgz"), "package/package.json"],
        { encoding: "utf8" },
      );
      expect(manifest.status, manifest.stderr).toBe(0);
      const pkg = JSON.parse(manifest.stdout) as {
        dependencies?: Record<string, string>;
        devDependencies?: Record<string, string>;
        exports?: Record<string, unknown>;
      };
      expect(pkg.dependencies ?? {}).toEqual({});
      expect(pkg.devDependencies).toBeUndefined();
      expect(pkg.exports).toHaveProperty(".");
      expect(pkg.exports).toHaveProperty("./cactus");
      const index = spawnSync(
        "tar",
        ["-xOzf", join(packed, "larkxai-react-native-0.1.2.tgz"), "package/dist/index.js"],
        { encoding: "utf8" },
      );
      expect(index.stdout).not.toContain("cactus-react-native");
      expect(index.stdout).not.toContain("@larkxai/host");
      const declarations = spawnSync(
        "tar",
        ["-xOzf", join(packed, "larkxai-react-native-0.1.2.tgz"), "package/dist/index.d.ts"],
        { encoding: "utf8" },
      );
      expect(declarations.stdout).not.toContain("@larkxai/");
      expect(readFileSync(join(root, "packages/react-native/package.json"), "utf8")).toContain(
        '"@larkxai/host": "workspace:*"',
      );
    } finally {
      spawnSync("node", ["packages/react-native/scripts/prepare-publish.mjs", "restore"], {
        cwd: root,
      });
    }
  }, 120_000);
});
