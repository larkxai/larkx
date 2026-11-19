import {
  createEngine,
  EngineTermination,
  type Engine,
  type EngineHooks,
  type WorkflowStorage,
} from "@larkx/core";
import { createMemoryStorage } from "@larkx/storage-memory";
import { createAutoClock } from "@larkx/testing";
import { describe, expect, it } from "vitest";

import { activityRows, recoveryStats } from "../../examples/field-inspection-agent/src/activity.js";
import {
  formatReport,
  groundReport,
  readReport,
} from "../../examples/field-inspection-agent/src/report.js";
import {
  createInspectionAgent,
  scriptedInspectionModel,
} from "../../examples/field-inspection-agent/src/script.js";
import { withTextCalls } from "../../examples/field-inspection-agent/src/device.js";
import { textToolCalls } from "../../examples/field-inspection-agent/src/text-tool.js";
import {
  clearSessionCalls,
  inspectionTools,
  sessionCalls,
} from "../../examples/field-inspection-agent/src/tools.js";

function isAgentResult(value: unknown): value is { finish: string } {
  return typeof value === "object" && value !== null && "finish" in value;
}

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

describe("field inspection agent", () => {
  it("saves a report from the bundled notes without repeating tools", async () => {
    clearSessionCalls();
    const engine = testEngine();
    const agent = createInspectionAgent(engine, scriptedInspectionModel());
    const handle = await agent.start({
      id: "field-1",
      input: { message: "Review today's inspection notes and create a report." },
    });
    const result = await handle.result();
    expect(result.finish).toBe("stop");
    const steps = await engine.getSteps(handle.id);
    const saved = steps.map((step) => readReport(step.output)).find((item) => item !== null);
    if (!saved) {
      throw new Error("expected a saved report");
    }
    expect(saved.title).toBe("Building Inspection Report");
    expect(saved?.priorities.map((item) => item.sourceNoteId)).toEqual([
      "n-pump",
      "n-exit",
      "n-ext",
      "n-cab",
      "n-hvac",
      "n-light",
      "n-paint",
    ]);
    expect(
      saved?.priorities.every(
        (item) => item.severity === "high" || item.severity === "medium" || item.severity === "low",
      ),
    ).toBe(true);
    expect(formatReport(saved)).toContain("n-pump");
    expect(formatReport(saved)).toContain("Not a certified safety assessment.");
    expect(sessionCalls().filter((call) => call.startsWith("get_inspection_notes"))).toEqual([
      "get_inspection_notes",
    ]);
    expect(saved.id).toBeDefined();
    await engine.close();
  });

  it("does not run a committed tool again after recovery", async () => {
    clearSessionCalls();
    const storage = createMemoryStorage();
    const first = testEngine(storage, {
      afterStepCommit(info) {
        if (info.stepKey === "tool-0-0") {
          throw new EngineTermination();
        }
      },
    });
    const agent = createInspectionAgent(first, scriptedInspectionModel());
    await expect(
      (
        await agent.start({ id: "field-recover", input: { message: "Create the report." } })
      ).result(),
    ).rejects.toMatchObject({ code: "execution_ownership_conflict" });
    expect(sessionCalls()).toEqual(["get_inspection_notes"]);

    clearSessionCalls();
    const second = testEngine(storage);
    createInspectionAgent(second, scriptedInspectionModel());
    const [handle] = await second.recover();
    if (!handle) {
      throw new Error("expected the interrupted run to recover");
    }
    const result = await handle.result();
    if (!isAgentResult(result)) {
      throw new Error("expected an agent result");
    }
    expect(result.finish).toBe("stop");
    expect(sessionCalls()[0]).toBe("get_maintenance_checklist");
    expect(sessionCalls().some((call) => call.startsWith("get_inspection_notes"))).toBe(false);
    const steps = await second.getSteps(handle.id);
    const notes = steps.find((step) => step.stepKey === "tool-0-0");
    expect(notes?.attemptCount).toBe(1);
    const history = await second.getHistory(handle.id);
    expect(history.some((event) => event.type === "WORKFLOW_RECOVERED")).toBe(true);
    expect(recoveryStats(steps, history).recoveries).toBe(1);
    expect(recoveryStats(steps, history).repeated).toBe(0);
    await second.close();
  });

  it("reads a tool call when the model writes it as text", () => {
    const calls = textToolCalls(
      'I should start.\n{"name":"get_inspection_notes","arguments":{}}\n{"name":"not_a_tool","arguments":{}}',
    );
    expect(calls).toEqual([{ id: "text-0", name: "get_inspection_notes", arguments: {} }]);
    expect(textToolCalls("No tools here.")).toEqual([]);
    const salvaged = withTextCalls({
      message: '{"name":"save_report","arguments":{"title":"Building Inspection Report"}}',
      finish: "stop",
      calls: [],
    });
    expect(salvaged.finish).toBe("tool_calls");
    expect(salvaged.calls.map((call) => call.name)).toEqual(["save_report"]);
    expect(withTextCalls({ message: "No tools.", finish: "stop", calls: [] }).finish).toBe("stop");
  });

  it("keeps later rows pending until those steps commit", () => {
    const rows = activityRows([
      {
        stepKey: "tool-0-0",
        status: "COMPLETED",
        attemptCount: 1,
        output: { ok: true, name: "get_inspection_notes", output: { notes: [] } },
      },
    ]);
    expect(rows.map((row) => [row.label, row.state])).toEqual([
      ["Read inspection notes", "completed"],
      ["Check maintenance requirements", "pending"],
      ["Review equipment history", "pending"],
      ["Generate report", "pending"],
      ["Save report", "pending"],
    ]);
    expect(rows.every((row) => row.where === "LOCAL")).toBe(true);
  });

  it("drops priorities that are not in the bundled notes", () => {
    expect(() =>
      groundReport(
        {
          title: "Building Inspection Report",
          summary: "Nothing matched.",
          priorities: [{ issue: "Invented boiler explosion", sourceNoteId: "n-missing" }],
          followUp: [],
          routine: [],
        },
        "op-1",
      ),
    ).toThrow(/bundled inspection note/);
    const report = groundReport(
      {
        title: "Building Inspection Report",
        summary: "Water at the pump.",
        priorities: [{ issue: "leak", severity: "low", sourceNoteId: "n-pump" }],
        followUp: ["Check the seal."],
        routine: [],
      },
      "op-2",
    );
    expect(report.priorities[0]).toMatchObject({
      sourceNoteId: "n-pump",
      severity: "high",
      issue: "Water leakage observed near the basement pump.",
    });
  });

  it("can delay the equipment read only when asked", async () => {
    const tool = inspectionTools({ delayMs: 30 }).find(
      (item) => item.name === "get_equipment_history",
    );
    const started = Date.now();
    const output = await tool?.run(
      {},
      {
        operationId: "op",
        attempt: 1,
        runId: "run",
        stepKey: "tool",
        signal: new AbortController().signal,
      },
    );
    expect(Date.now() - started).toBeGreaterThanOrEqual(20);
    expect(output).toMatchObject({ equipment: expect.any(Array) });
  });
});
