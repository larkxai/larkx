import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const roots = [
  "packages/protocol/src",
  "packages/core/src",
  "packages/agent/src",
  "packages/storage-memory/src",
  "packages/storage-sqlite/src",
  "packages/telemetry/src",
];

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

  it("keeps the testable React Native modules free of native imports", () => {
    const files = [
      "packages/react-native/src/storage.ts",
      "packages/react-native/src/ownership.ts",
      "packages/react-native/src/artifacts.ts",
      "packages/react-native/src/lifecycle.ts",
    ];
    const offenders = files.filter((file) =>
      /from\s+["'](expo|react-native|node:)/.test(readFileSync(file, "utf8")),
    );
    expect(offenders).toEqual([]);
  });

  it("does not import a model provider into the core", () => {
    const source = readFileSync("packages/core/src/engine.ts", "utf8");
    expect(source).not.toMatch(/cactus|ollama|openai|anthropic/i);
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
