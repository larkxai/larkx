import {
  EVENT_TYPES,
  LarkxError,
  PROTOCOL_VERSION,
  STEP_TRANSITIONS,
  WORKFLOW_TRANSITIONS,
  canTransitionStep,
  canTransitionWorkflow,
  checkProtocolCompatibility,
  isTerminalWorkflowStatus,
  stepTransitionEntries,
  validateRemoteDispatchRequest,
  workflowTransitionEntries,
} from "@larkx/protocol";
import { describe, expect, it } from "vitest";

describe("protocol transitions", () => {
  it("matches the published workflow table for every pair", () => {
    for (const [from, to] of workflowTransitionEntries()) {
      expect(canTransitionWorkflow(from, to)).toBe(WORKFLOW_TRANSITIONS[from].includes(to));
    }
  });

  it("matches the published step table for every pair", () => {
    for (const [from, to] of stepTransitionEntries()) {
      expect(canTransitionStep(from, to)).toBe(STEP_TRANSITIONS[from].includes(to));
    }
  });

  it("keeps terminal workflow states closed", () => {
    for (const status of ["COMPLETED", "FAILED", "CANCELLED"] as const) {
      expect(isTerminalWorkflowStatus(status)).toBe(true);
      expect(WORKFLOW_TRANSITIONS[status]).toEqual([]);
    }
  });

  it("does not treat an interrupted step as failed", () => {
    expect(STEP_TRANSITIONS.RUNNING).toContain("UNKNOWN_OUTCOME");
    expect(STEP_TRANSITIONS.RUNNING).toContain("RETRY_SCHEDULED");
    expect(STEP_TRANSITIONS.COMPLETED).toEqual([]);
  });
});

describe("protocol compatibility", () => {
  it("accepts only the current version", () => {
    expect(checkProtocolCompatibility(PROTOCOL_VERSION).compatible).toBe(true);
    expect(checkProtocolCompatibility(PROTOCOL_VERSION + 1).compatible).toBe(false);
    expect(checkProtocolCompatibility(0).compatible).toBe(false);
  });
});

describe("remote dispatch contract", () => {
  it("rejects device-only dispatch and accepts an explicit cloud payload", () => {
    const request = {
      protocolVersion: PROTOCOL_VERSION,
      tenantId: "tenant-1",
      appId: "app-1",
      runId: "run-1",
      workflowName: "room-analysis",
      workflowVersion: 1,
      stepKey: "plan",
      operationId: "op-1",
      handler: "generate-plan-v1",
      handlerVersion: 1,
      attempt: 1,
      input: { objects: 1 },
      dataPolicy: "cloud-allowed" as const,
    };
    expect(validateRemoteDispatchRequest(request).ok).toBe(true);
    expect(validateRemoteDispatchRequest({ ...request, dataPolicy: "device-only" }).ok).toBe(false);
  });
});

describe("errors", () => {
  it("preserves a stable code", () => {
    const error = new LarkxError({ code: "replay_divergence", message: "diverged" });
    expect(error.code).toBe("replay_divergence");
    expect(error.retryable).toBe(false);
    expect(EVENT_TYPES).toContain("STEP_OUTCOME_UNKNOWN");
  });
});
