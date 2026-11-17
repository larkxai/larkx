import {
  encodeJson,
  reduceApply,
  reduceClaim,
  reduceCreateRun,
  reduceRequestCancel,
} from "@larkx/core";
import { LarkxError, PROTOCOL_VERSION } from "@larkx/protocol";
import { describe, expect, it } from "vitest";

function created() {
  return reduceCreateRun(null, {
    runId: "run-1",
    workflowName: "room-analysis",
    workflowVersion: 1,
    inputJson: encodeJson({ photo: "secret" }),
    nowMs: 10,
    eventId: "evt-1",
    protocolVersion: PROTOCOL_VERSION,
    dataPolicy: "device-only",
  }).state;
}

describe("execution reducer", () => {
  it("refuses sensitive event payload keys", () => {
    const state = created();
    const claim = reduceClaim(state, { ownerId: "a", nowMs: 11, leaseMs: 0, maySteal: false });
    expect(() =>
      reduceApply(claim.state, {
        type: "transition-run",
        runId: "run-1",
        fence: { ownerId: "a", epoch: claim.epoch },
        nowMs: 12,
        to: "RUNNING",
        event: {
          eventId: "evt-2",
          type: "WORKFLOW_STARTED",
          createdAt: 12,
          payload: { output: "secret" },
        },
      }),
    ).toThrow(LarkxError);
  });

  it("redirects completion when cancellation was requested", () => {
    let state = created();
    const claim = reduceClaim(state, { ownerId: "a", nowMs: 11, leaseMs: 0, maySteal: false });
    state = claim.state;
    state = reduceRequestCancel(state, 12);
    const outcome = reduceApply(state, {
      type: "transition-run",
      runId: "run-1",
      fence: { ownerId: "a", epoch: claim.epoch },
      nowMs: 13,
      to: "RUNNING",
      event: { eventId: "evt-run", type: "WORKFLOW_STARTED", createdAt: 13, payload: {} },
    });
    const completed = reduceApply(outcome.state, {
      type: "transition-run",
      runId: "run-1",
      fence: { ownerId: "a", epoch: claim.epoch },
      nowMs: 14,
      to: "COMPLETED",
      honorCancel: true,
      outputJson: encodeJson({ ok: true }),
      event: { eventId: "evt-done", type: "WORKFLOW_COMPLETED", createdAt: 14, payload: {} },
    });
    expect(completed.appliedStatus).toBe("CANCELLED");
    expect(completed.state.events.at(-1)?.type).toBe("WORKFLOW_CANCELLED");
  });
});
