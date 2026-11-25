import { readFileSync } from "node:fs";

import {
  PROTOCOL_VERSION,
  SENSITIVE_EVENT_KEYS,
  STEP_TRANSITIONS,
  WORKFLOW_TRANSITIONS,
} from "@larkxai/protocol";
import { STORAGE_SCHEMA_VERSION } from "@larkxai/storage-sqlite";
import { describe, expect, it } from "vitest";

interface Fixture {
  protocolVersion: number;
  storageSchemaVersion: number;
  workflowTransitions: Record<string, string[]>;
  stepTransitions: Record<string, string[]>;
  sensitiveEventKeys: string[];
  interruptResolution: Record<string, string>;
  egress: Record<string, Record<string, boolean>>;
}

const fixture = JSON.parse(
  readFileSync(new URL("../../native/conformance/transitions.json", import.meta.url), "utf8"),
) as Fixture;

describe("native conformance fixture", () => {
  it("freezes the protocol tables the C++ core loads", () => {
    expect(fixture.protocolVersion).toBe(PROTOCOL_VERSION);
    expect(fixture.storageSchemaVersion).toBe(STORAGE_SCHEMA_VERSION);
    expect(fixture.workflowTransitions).toEqual(WORKFLOW_TRANSITIONS);
    expect(fixture.stepTransitions).toEqual(STEP_TRANSITIONS);
    expect(fixture.sensitiveEventKeys).toEqual([...SENSITIVE_EVENT_KEYS]);
  });

  it("freezes interrupt classification and SDK egress", () => {
    expect(fixture.interruptResolution).toEqual({
      pure: "retry",
      idempotent: "retry",
      "non-idempotent": "unknown",
    });
    expect(fixture.egress["device-only"]).toEqual({
      local: true,
      "cloud-model": false,
      "remote-tool": false,
      "remote-agent": false,
      telemetry: false,
    });
    expect(fixture.egress["cloud-allowed"]).toEqual({
      local: true,
      "cloud-model": true,
      "remote-tool": true,
      "remote-agent": true,
      telemetry: false,
    });
  });
});
