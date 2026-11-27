import { openDatabaseSync, type SQLiteDatabase } from "expo-sqlite";

import { defineTool } from "@larkxai/react-native";

import { commitOnce, type EffectStore } from "./field-effects";
import { INSPECTION_NOTES, PREVIOUS_INSPECTIONS, PUMP } from "./equipment";
import type { FailureGate } from "./failure-gate";

const EQUIPMENT: Record<string, { readonly spec: string; readonly limit: string }> = {
  [PUMP.id]: {
    spec: PUMP.spec,
    limit: PUMP.limit,
  },
};

interface FieldStore extends EffectStore {
  list(): readonly string[];
}

let effectsStore: FieldStore | undefined;

function effects(): FieldStore {
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
      list() {
        return db
          .getAllSync<{ body: string }>("SELECT body FROM tool_effects")
          .map((row) => row.body);
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
    handler: () => ({ notes: [...INSPECTION_NOTES] }),
  });
}

export function getPreviousInspections() {
  return defineTool({
    name: "get_previous_inspections",
    description: "Read earlier inspection notes stored on this device for this equipment.",
    schema: {
      type: "object",
      properties: { equipmentId: { type: "string" } },
      required: ["equipmentId"],
    },
    effects: "pure",
    handler: async (input) => ({
      equipmentId: textField(input, "equipmentId"),
      inspections: [
        ...PREVIOUS_INSPECTIONS.map((item) => ({ ...item })),
        ...(await savedReports()),
      ],
    }),
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
    getPreviousInspections(),
    saveInspectionReport(gate),
    recordPartReplacement(gate),
  ];
}

async function savedReports(): Promise<readonly { id: string; date: string; note: string }[]> {
  const bodies = effects().list();
  const reports = [];
  for (const body of bodies) {
    let parsed: { report?: unknown };
    try {
      parsed = JSON.parse(body) as { report?: unknown };
    } catch {
      continue;
    }
    if (typeof parsed.report === "string" && parsed.report.length > 0) {
      reports.push({
        id: "saved-report",
        date: "saved on this device",
        note: parsed.report,
      });
    }
  }
  return reports;
}

function textField(input: unknown, key: string): string {
  if (typeof input === "object" && input !== null && key in input) {
    const value = (input as Record<string, unknown>)[key];
    return typeof value === "string" ? value : "";
  }
  return "";
}
