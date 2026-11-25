import { existsSync, mkdtempSync, readdirSync, readFileSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync, type SpawnSyncReturns } from "node:child_process";

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
    const packageDir = join(root, "packages/react-native");
    const pack = spawnSync("pnpm", ["--dir", packageDir, "pack", "--pack-destination", packed], {
      cwd: root,
      encoding: "utf8",
    });
    try {
      expect(pack.status, `${pack.stdout}\n${pack.stderr}`).toBe(0);
      const tarball = packedTarball(pack, packed, packageDir);
      const listing = spawnSync("tar", ["-tzf", tarball], {
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
      const manifest = spawnSync("tar", ["-xOzf", tarball, "package/package.json"], {
        encoding: "utf8",
      });
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
      const index = spawnSync("tar", ["-xOzf", tarball, "package/dist/index.js"], {
        encoding: "utf8",
      });
      expect(index.stdout).not.toContain("cactus-react-native");
      expect(index.stdout).not.toContain("@larkxai/host");
      const declarations = spawnSync("tar", ["-xOzf", tarball, "package/dist/index.d.ts"], {
        encoding: "utf8",
      });
      expect(declarations.stdout).not.toContain("@larkxai/");
      expect(readFileSync(join(root, "packages/react-native/package.json"), "utf8")).toContain(
        '"@larkxai/host": "workspace:*"',
      );
    } finally {
      removePackedTarballs(packageDir);
      spawnSync("node", ["packages/react-native/scripts/prepare-publish.mjs", "restore"], {
        cwd: root,
      });
    }
  }, 120_000);
});

function packedTarball(
  pack: SpawnSyncReturns<string>,
  destination: string,
  packageDir: string,
): string {
  const roots = [destination, packageDir, root, process.cwd()];
  const printed = pack.stdout
    .replace(/\u001b\[[0-9;]*m/g, "")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.endsWith(".tgz"))
    .flatMap((line) => (line.startsWith("/") ? [line] : roots.map((dir) => join(dir, line))));
  const discovered = roots.flatMap((dir) =>
    readdirSync(dir)
      .filter((name) => name.endsWith(".tgz"))
      .map((name) => join(dir, name)),
  );
  const found = [...printed, ...discovered].find((path) => existsSync(path));
  expect(found, `${pack.stdout}\n${pack.stderr}\n${discovered.join("\n")}`).toBeTruthy();
  return found ?? "";
}

function removePackedTarballs(packageDir: string): void {
  for (const dir of [packageDir, root]) {
    for (const name of readdirSync(dir)) {
      if (name.endsWith(".tgz")) unlinkSync(join(dir, name));
    }
  }
}
