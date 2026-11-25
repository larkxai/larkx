import { describe, expect, it } from "vitest";

import { FailureGate } from "../../examples/react-native-workflow/src/failure-gate.js";

describe("development failure gate", () => {
  it("holds only the armed boundary", async () => {
    const gate = new FailureGate();
    gate.arm("before-tool");
    await gate.reach("before-model");
    expect(gate.heldBoundary()).toBeNull();
    let released = false;
    const pending = gate.reach("before-tool").then(() => {
      released = true;
    });
    await Promise.resolve();
    expect(gate.heldBoundary()).toBe("before-tool");
    expect(released).toBe(false);
    gate.release();
    await pending;
    expect(released).toBe(true);
    expect(gate.heldBoundary()).toBeNull();
  });
});
