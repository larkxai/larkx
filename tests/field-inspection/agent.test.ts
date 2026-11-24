import {
  createEngine,
  EngineTermination,
  type Engine,
  type EngineHooks,
  type WorkflowStorage,
} from "@larkxai/core";
import { createMemoryStorage } from "@larkxai/storage-memory";
import { createAutoClock } from "@larkxai/testing";
import { describe, expect, it } from "vitest";

import {
  activityRows,
  reportFromSteps,
} from "../../examples/field-inspection-agent/src/activity.js";
import {
  clearStageCalls,
  scriptedInspectionModel,
  stageCalls,
} from "../../examples/field-inspection-agent/src/scripted.js";
import { parseIssues } from "../../examples/field-inspection-agent/src/stages.js";
import { createInspectionWorkflow } from "../../examples/field-inspection-agent/src/workflow.js";

function testEngine(storage: WorkflowStorage = createMemoryStorage(), hooks?: EngineHooks): Engine {
  return createEngine({
    storage,
    workflows: [],
    clock: createAutoClock(),
    leaseMs: 0,
    heartbeat: false,
    ...(hooks !== undefined ? { hooks } : {}),
  });
}

describe("inspection workflow", () => {
  it("builds the report from the notes that were entered", async () => {
    clearStageCalls();
    const engine = testEngine();
    const workflow = createInspectionWorkflow(scriptedInspectionModel());
    engine.register(workflow);
    const handle = await engine.start(workflow, {
      id: "notes-1",
      input: {
        notes:
          "Found water leakage near the basement pump, an obstructed emergency exit, and unusual noise from HVAC-03.",
      },
    });
    const report = await handle.result();
    expect(report.body).toContain("basement pump");
    expect(report.issues.map((issue) => issue.severity)).toEqual(["high", "high", "medium"]);
    expect(report.actions.length).toBe(report.issues.length);
    expect(stageCalls()).toEqual(["extract", "classify", "plan", "report"]);
    const steps = await engine.getSteps(handle.id);
    expect(reportFromSteps(steps)?.summary).toContain("basement pump");
    await engine.close();
  });

  it("classifies an unfamiliar note as unspecified", async () => {
    clearStageCalls();
    const engine = testEngine();
    const workflow = createInspectionWorkflow(scriptedInspectionModel());
    engine.register(workflow);
    const report = await (
      await engine.start(workflow, {
        id: "notes-2",
        input: { notes: "The roof door sticks when it rains." },
      })
    ).result();
    expect(report.issues).toEqual([
      { text: "The roof door sticks when it rains", severity: "unspecified", rule: null },
    ]);
    await engine.close();
  });

  it("does not run a committed stage again after recovery", async () => {
    clearStageCalls();
    const storage = createMemoryStorage();
    const first = testEngine(storage, {
      afterStepCommit(info) {
        if (info.stepKey === "classify") {
          throw new EngineTermination();
        }
      },
    });
    const workflow = createInspectionWorkflow(scriptedInspectionModel());
    first.register(workflow);
    await expect(
      (
        await first.start(workflow, {
          id: "recover-1",
          input: { notes: "Water leakage near the basement pump." },
        })
      ).result(),
    ).rejects.toMatchObject({ code: "execution_ownership_conflict" });
    expect(stageCalls()).toEqual(["extract", "classify"]);

    clearStageCalls();
    const second = testEngine(storage);
    second.register(createInspectionWorkflow(scriptedInspectionModel()));
    const [handle] = await second.recover();
    if (!handle) {
      throw new Error("expected the interrupted run to recover");
    }
    const report = await handle.result();
    if (!isReport(report)) {
      throw new Error("expected a report");
    }
    expect(report.body).toContain("basement pump");
    expect(stageCalls()).toEqual(["plan", "report"]);
    const steps = await second.getSteps(handle.id);
    expect(steps.find((step) => step.stepKey === "extract")?.attemptCount).toBe(1);
    expect(steps.find((step) => step.stepKey === "classify")?.attemptCount).toBe(1);
    const history = await second.getHistory(handle.id);
    expect(history.some((event) => event.type === "WORKFLOW_RECOVERED")).toBe(true);
    await second.close();
  });

  it("keeps later stages waiting until the run finishes", () => {
    const steps = [
      {
        stepKey: "extract",
        status: "COMPLETED",
        attemptCount: 1,
        output: { issues: [{ text: "Water near the pump" }], model: "scripted-inspection" },
      },
    ];
    expect(activityRows(steps, "RUNNING").map((row) => [row.label, row.state, row.detail])).toEqual(
      [
        ["Extract issues", "completed", "1 issue extracted"],
        ["Classify priorities", "waiting", "Waiting"],
        ["Create action plan", "waiting", "Waiting"],
        ["Generate report", "waiting", "Waiting"],
      ],
    );
    expect(activityRows(steps, "COMPLETED").map((row) => row.state)).toEqual([
      "completed",
      "skipped",
      "skipped",
      "skipped",
    ]);
  });

  it("reads issue lines from a chatty model reply", () => {
    expect(
      parseIssues("Sure, here are the issues:\n- Water near the pump\n- Exit B is blocked"),
    ).toEqual(["Water near the pump", "Exit B is blocked"]);
  });
});

function isReport(value: unknown): value is { body: string } {
  return (
    typeof value === "object" && value !== null && "body" in value && typeof value.body === "string"
  );
}
