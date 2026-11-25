import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const roots = ["packages/protocol/src", "packages/host/src", "packages/telemetry/src"];

describe("package boundaries", () => {
  it("keeps Node and React Native imports out of the platform-independent packages", () => {
    const offenders: string[] = [];
    for (const root of roots) {
      for (const file of walk(root)) {
        const source = readFileSync(file, "utf8");
        if (
          /from\s+["']node:|from\s+["']react-native|from\s+["']fs["']|from\s+["']path["']|from\s+["']cactus-react-native|from\s+["']@larkxai\/cactus|from\s+["']expo/.test(
            source,
          )
        ) {
          offenders.push(file);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("keeps the host driver free of a platform SDK", () => {
    const imports = readFileSync("packages/host/src/runtime.ts", "utf8")
      .split("\n")
      .filter((line) => line.includes("from ") || line.includes("require("));
    expect(imports.join("\n")).not.toMatch(/react-native|node:|expo|cactus/);
  });

  it("keeps the Cactus SDK inside the native module", () => {
    const adapter = readFileSync("packages/cactus/src/adapter.ts", "utf8");
    expect(adapter).not.toMatch(/cactus-react-native/);
    const native = readFileSync("packages/cactus/src/native.ts", "utf8");
    expect(native).toMatch(/cactus-react-native/);
  });
});

function walk(directory: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) {
      files.push(...walk(path));
    } else if (path.endsWith(".ts")) {
      files.push(path);
    }
  }
  return files;
}
