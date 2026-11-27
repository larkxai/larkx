import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Compiles and runs the Android attempt-table checks with javac.
 * This is not an emulator test and it does not load the React Native module.
 */
describe("android http bookkeeping", () => {
  it("returns to an empty table and bounds the waiting queue", () => {
    const output = mkdtempSync(join(tmpdir(), "larkx-android-http-"));
    try {
      execFileSync(
        "javac",
        [
          "-d",
          output,
          "packages/react-native/android/src/main/java/ai/larkx/reactnative/HttpAttempts.java",
          "packages/react-native/android/src/main/java/ai/larkx/reactnative/HttpLane.java",
          "tests/react-native/android/ai/larkx/reactnative/HttpAttemptsTest.java",
        ],
        { cwd: join(import.meta.dirname, "../..") },
      );
      const printed = execFileSync(
        "java",
        ["-cp", output, "ai.larkx.reactnative.HttpAttemptsTest"],
        {
          encoding: "utf8",
        },
      );
      expect(printed).toContain("android http bookkeeping checks passed");
    } finally {
      rmSync(output, { recursive: true, force: true });
    }
  });
});
