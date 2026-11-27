import { describe, expect, it } from "vitest";

import { recoveryMismatch } from "../../examples/react-native-agent/src/agent-identity.js";
import {
  commitOnce,
  type EffectStore,
} from "../../examples/react-native-agent/src/field-effects.js";
import { operationLabel } from "../../examples/react-native-agent/src/operation-label.js";
import { scriptedInspectionResponse } from "../../examples/react-native-agent/src/scripted-inspection.js";
import { telemetryPresentation } from "../../examples/react-native-agent/src/telemetry-label.js";
import type { TelemetryDeliveryStatus } from "@larkxai/host";

describe("field inspection demo", () => {
  it("stores an idempotent effect once for an operation id", async () => {
    const saved = new Map<string, string>();
    const store: EffectStore = {
      get: (operationId) => saved.get(operationId),
      set: (operationId, body) => {
        saved.set(operationId, body);
      },
    };
    const first = await commitOnce(store, "op-1", '{"report":"seal"}');
    const second = await commitOnce(store, "op-1", '{"report":"other"}');
    expect(first.deduplicated).toBe(false);
    expect(second.deduplicated).toBe(true);
    expect(second.body).toBe(first.body);
    expect(saved.size).toBe(1);
  });

  it("returns the stored body when two commits overlap", async () => {
    const saved = new Map<string, string>();
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let reads = 0;
    const store: EffectStore = {
      async get(operationId) {
        reads += 1;
        if (reads === 1) {
          await gate;
        }
        return saved.get(operationId);
      },
      set(operationId, body) {
        saved.set(operationId, body);
      },
    };
    const first = commitOnce(store, "op-1", '{"report":"seal"}');
    const second = commitOnce(store, "op-1", '{"report":"other"}');
    await Promise.resolve();
    release();
    const [savedFirst, savedSecond] = await Promise.all([first, second]);
    expect(savedFirst).toEqual({ deduplicated: false, body: '{"report":"seal"}' });
    expect(savedSecond).toEqual({ deduplicated: true, body: '{"report":"seal"}' });
    expect(saved.size).toBe(1);
  });

  it("refuses to recover a local run with the scripted model", () => {
    expect(recoveryMismatch("field-assistant-local", "scripted")).toMatch(/local Cactus model/);
    expect(recoveryMismatch("field-assistant-scripted", "local")).toMatch(/scripted model/);
    expect(recoveryMismatch("field-assistant-local", "local")).toBeNull();
    expect(recoveryMismatch("field-assistant-scripted", "scripted")).toBeNull();
  });

  it("continues the script from committed tool results", () => {
    const first = scriptedInspectionResponse([
      { role: "system", content: "inspect" },
      { role: "user", content: "Inspect pump 12" },
    ]);
    expect(first.calls[0]?.name).toBe("read_inspection_notes");
    const afterNotes = scriptedInspectionResponse([
      { role: "tool", name: "read_inspection_notes", content: "notes" },
    ]);
    expect(afterNotes.calls[0]?.name).toBe("get_equipment_details");
    const afterDetails = scriptedInspectionResponse([
      { role: "tool", name: "read_inspection_notes", content: "notes" },
      { role: "tool", name: "get_equipment_details", content: "spec" },
    ]);
    expect(afterDetails.calls[0]?.name).toBe("get_previous_inspections");
    const delegated = scriptedInspectionResponse(
      [
        { role: "tool", name: "read_inspection_notes", content: "notes" },
        { role: "tool", name: "get_equipment_details", content: "spec" },
        { role: "tool", name: "get_previous_inspections", content: "history" },
      ],
      { delegate: true },
    );
    expect(delegated.calls[0]?.name).toBe("procurement-agent");
    expect(delegated.calls[0]?.arguments).toEqual({
      objective: "Find a compatible mechanical seal for pump 12",
      equipment: "Industrial water pump",
      component: "Mechanical seal",
    });
    const withSupplier = scriptedInspectionResponse(
      [
        { role: "tool", name: "read_inspection_notes", content: "notes" },
        { role: "tool", name: "get_equipment_details", content: "spec" },
        { role: "tool", name: "get_previous_inspections", content: "history" },
        {
          role: "tool",
          name: "procurement-agent",
          content: "Fictional supplier Northwind Seal Co.",
        },
      ],
      { delegate: true },
    );
    expect(withSupplier.calls[0]?.name).toBe("save_inspection_report");
    expect(withSupplier.calls[0]?.arguments.report).toContain("Northwind Seal Co.");
    expect(withSupplier.calls[0]?.arguments.report).not.toContain("notes");
    const done = scriptedInspectionResponse([
      { role: "tool", name: "read_inspection_notes", content: "notes" },
      { role: "tool", name: "get_equipment_details", content: "spec" },
      { role: "tool", name: "get_previous_inspections", content: "history" },
      { role: "tool", name: "save_inspection_report", content: "saved" },
    ]);
    expect(done.finish).toBe("stop");
    expect(done.calls).toEqual([]);
    expect(done.message).toMatch(/saved on this device/);
  });

  it("labels runtime observations without inventing a step", () => {
    expect(
      operationLabel({
        type: "tool-requested",
        runId: "run-1",
        toolName: "read_inspection_notes",
        atMs: 1,
      })?.label,
    ).toBe("Reading inspection notes");
    expect(
      operationLabel({
        type: "remote-waiting",
        runId: "run-1",
        toolName: "procurement-agent",
        atMs: 1,
      }),
    ).toEqual({ label: "Waiting for remote research", kind: "remote" });
    expect(
      operationLabel({
        type: "tool-requested",
        runId: "run-1",
        stepKey: "tool-0-0",
        atMs: 1,
      }),
    ).toBeNull();
  });

  it("names telemetry from the exporter status", () => {
    expect(telemetryPresentation(status({ enabled: false }))).toBe("Disabled");
    expect(telemetryPresentation(status({ phase: "offline", lastError: "offline" }))).toBe(
      "Offline",
    );
    expect(
      telemetryPresentation(status({ phase: "unauthorized", lastError: "unauthorized" })),
    ).toBe("Unauthorized");
    expect(telemetryPresentation(status({ lastError: "redirected" }))).toBe("Configuration error");
    expect(telemetryPresentation(status({ phase: "pending", pendingEvents: 2 }))).toBe("Pending");
    expect(telemetryPresentation(status({ phase: "idle", lastSyncedAt: 10 }))).toBe("Synchronized");
    expect(telemetryPresentation(status({ phase: "offline", lastError: "rate_limited" }))).toBe(
      "Rate limited",
    );
    expect(
      telemetryPresentation(status({ phase: "pending", lastError: "rejected", rejectedRuns: 1 })),
    ).toBe("Partial synchronization");
    expect(
      telemetryPresentation(
        status({ phase: "idle", lastSyncedAt: 10, lastError: "rejected", rejectedRuns: 1 }),
      ),
    ).toBe("Partial synchronization");
  });
});

function status(overrides: Partial<TelemetryDeliveryStatus>): TelemetryDeliveryStatus {
  return {
    enabled: true,
    phase: "idle",
    pendingEvents: 0,
    lastSyncedAt: null,
    lastError: null,
    installationId: null,
    observations: [],
    droppedObservations: 0,
    exportBehind: false,
    rejectedRuns: 0,
    ...overrides,
  };
}
