import { describe, expect, it } from "vitest";

import { recoveryMismatch } from "../../examples/react-native-workflow/src/agent-identity.js";
import {
  commitOnce,
  type EffectStore,
} from "../../examples/react-native-workflow/src/field-effects.js";
import { scriptedInspectionResponse } from "../../examples/react-native-workflow/src/scripted-inspection.js";

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
    const afterSave = scriptedInspectionResponse([
      { role: "tool", name: "read_inspection_notes", content: "notes" },
      { role: "tool", name: "get_equipment_details", content: "spec" },
      { role: "tool", name: "save_inspection_report", content: "saved" },
    ]);
    expect(afterSave.calls[0]?.name).toBe("record_part_replacement");
    const done = scriptedInspectionResponse([
      { role: "tool", name: "read_inspection_notes", content: "notes" },
      { role: "tool", name: "get_equipment_details", content: "spec" },
      { role: "tool", name: "save_inspection_report", content: "saved" },
      { role: "tool", name: "record_part_replacement", content: "issued" },
    ]);
    expect(done.finish).toBe("stop");
    expect(done.calls).toEqual([]);
  });
});
