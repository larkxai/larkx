import { describe, expect, it } from "vitest";

import { uuidFrom } from "../../packages/react-native/src/native-id.js";

describe("native telemetry ids", () => {
  it("accepts a UUID from the native generator", () => {
    const id = uuidFrom({ randomUUID: () => "22110801-F815-4768-AAD1-62884999DC12" });
    expect(id).toBe("22110801-f815-4768-aad1-62884999dc12");
  });

  it("rejects a missing generator and a non-UUID value", () => {
    expect(() => uuidFrom({})).toThrow(/expo-crypto/);
    expect(() => uuidFrom({ randomUUID: () => "not-a-uuid" })).toThrow(/not a UUID/);
    expect(() =>
      uuidFrom({
        randomUUID: () => `${Date.now().toString(16)}-4abc-8def-counter`,
      }),
    ).toThrow(/not a UUID/);
  });
});
