import { openDatabaseSync, type SQLiteDatabase } from "expo-sqlite";

import { defineTool } from "@larkxai/react-native";

import { commitOnce, type EffectStore } from "./field-effects";
import type { FailureGate } from "./failure-gate";

const NOTES = [
  "Pump 12: vibration increased after the last night shift.",
  "Seal weeps when pressure is above 80 psi.",
  "Last filter change was 140 days ago. The interval is 90 days.",
];

const EQUIPMENT: Record<string, { readonly spec: string; readonly limit: string }> = {
  "pump-12": {
    spec: "Centrifugal pump, 15 horsepower, mechanical seal, 90-day filter interval.",
    limit: "Normal vibration is under 4 mm/s. Seal leakage is not normal above 60 psi.",
  },
};

let effectsStore: EffectStore | undefined;

function effects(): EffectStore {
  if (effectsStore === undefined) {
    const db: SQLiteDatabase = openDatabaseSync("larkx-field-data.db");
    db.execSync(
      "CREATE TABLE IF NOT EXISTS tool_effects (operation_id TEXT PRIMARY KEY, body TEXT NOT NULL)",
    );
    effectsStore = {
      get(operationId) {
        const row = db.getFirstSync<{ body: string }>(
          "SELECT body FROM tool_effects WHERE operation_id = ?",
          [operationId],
        );
        return row === null ? undefined : row.body;
      },
      set(operationId, body) {
        db.runSync(
          "INSERT INTO tool_effects (operation_id, body) VALUES (?, ?) ON CONFLICT(operation_id) DO NOTHING",
          [operationId, body],
        );
      },
    };
  }
  return effectsStore;
}

/** Body stored for an operation id in the field-data database, if the tool wrote one. */
export async function storedFieldEffect(operationId: string): Promise<string | undefined> {
  const body = await effects().get(operationId);
  return body;
}

export function readInspectionNotes() {
  return defineTool({
    name: "read_inspection_notes",
    description: "Read the locally stored inspection notes for this site.",
    schema: { type: "object", properties: {} },
    effects: "pure",
    handler: () => ({ notes: NOTES }),
  });
}

export function getEquipmentDetails() {
  return defineTool({
    name: "get_equipment_details",
    description: "Look up the local specification for an equipment id such as pump-12.",
    schema: {
      type: "object",
      properties: { equipmentId: { type: "string" } },
      required: ["equipmentId"],
    },
    effects: "pure",
    handler: (input) => {
      const equipmentId = textField(input, "equipmentId");
      const found = EQUIPMENT[equipmentId];
      if (found === undefined) {
        return { equipmentId, found: false };
      }
      return { equipmentId, found: true, ...found };
    },
  });
}

export function saveInspectionReport(gate?: FailureGate) {
  return defineTool({
    name: "save_inspection_report",
    description:
      "Save the inspection report on this device. Repeating the same operation returns the stored report.",
    schema: {
      type: "object",
      properties: { report: { type: "string" } },
      required: ["report"],
    },
    effects: "idempotent",
    handler: async (input, context) => {
      const report = textField(input, "report");
      const stored = await commitOnce(effects(), context.operationId, JSON.stringify({ report }));
      if (!stored.deduplicated) {
        await gate?.reach("during-idempotent-tool");
      }
      const parsed = JSON.parse(stored.body) as { report?: unknown };
      return {
        saved: true,
        deduplicated: stored.deduplicated,
        operationId: context.operationId,
        report: typeof parsed.report === "string" ? parsed.report : report,
      };
    },
  });
}

export function recordPartReplacement(gate?: FailureGate) {
  return defineTool({
    name: "record_part_replacement",
    description: "Record that a replacement part was issued. This cannot be repeated safely.",
    schema: {
      type: "object",
      properties: { part: { type: "string" } },
      required: ["part"],
    },
    effects: "non-idempotent",
    handler: async (input, context) => {
      const part = textField(input, "part");
      const stored = await commitOnce(effects(), context.operationId, JSON.stringify({ part }));
      if (stored.deduplicated) {
        return { recorded: false, duplicate: true, operationId: context.operationId, part };
      }
      await gate?.reach("during-non-idempotent-tool");
      return { recorded: true, duplicate: false, operationId: context.operationId, part };
    },
  });
}

export function fieldTools(gate?: FailureGate) {
  return [
    readInspectionNotes(),
    getEquipmentDetails(),
    saveInspectionReport(gate),
    recordPartReplacement(gate),
  ];
}

function textField(input: unknown, key: string): string {
  if (typeof input === "object" && input !== null && key in input) {
    const value = (input as Record<string, unknown>)[key];
    return typeof value === "string" ? value : "";
  }
  return "";
}
