import { LarkxError } from "@larkx/core";
import { defineTool, type Tool, type ToolContext } from "@larkx/agent";
import type { JsonValue } from "@larkx/protocol";

import { EQUIPMENT_HISTORY, INSPECTION_NOTES, MAINTENANCE_CHECKLIST } from "./records.js";
import { groundReport, type ReportDraft } from "./report.js";

const session: string[] = [];

export function sessionCalls(): readonly string[] {
  return session;
}

export function clearSessionCalls(): void {
  session.length = 0;
}

const empty = {
  type: "object" as const,
  properties: {},
  additionalProperties: false,
};

const reportSchema = {
  type: "object" as const,
  properties: {
    title: { type: "string" as const, description: "Report title" },
    summary: { type: "string" as const, description: "Short summary using the notes" },
    priorities: {
      type: "array" as const,
      description: "Issues taken from the notes",
      items: {
        type: "object" as const,
        properties: {
          issue: { type: "string" as const },
          severity: { type: "string" as const, description: "high, medium, or low" },
          sourceNoteId: { type: "string" as const, description: "Note id such as n-pump" },
        },
        required: ["issue", "sourceNoteId"],
        additionalProperties: false,
      },
    },
    followUp: {
      type: "array" as const,
      items: { type: "string" as const },
      description: "Follow-up actions",
    },
    routine: {
      type: "array" as const,
      items: { type: "string" as const },
      description: "Routine upkeep",
    },
  },
  required: ["title", "summary", "priorities", "followUp", "routine"],
  additionalProperties: false,
};

export function inspectionTools(options?: { readonly delayMs?: number }): Tool[] {
  const delayMs = options?.delayMs ?? 0;
  const notes = defineTool({
    name: "get_inspection_notes",
    description:
      "Return today's bundled building inspection notes. These are illustrative records.",
    inputSchema: empty,
    effects: "pure",
    run: () => {
      record("get_inspection_notes");
      return json({ notes: INSPECTION_NOTES });
    },
  });
  const checklist = defineTool({
    name: "get_maintenance_checklist",
    description:
      "Return the maintenance and safety requirements, including severity for each note.",
    inputSchema: empty,
    effects: "pure",
    run: () => {
      record("get_maintenance_checklist");
      return json({ checklist: MAINTENANCE_CHECKLIST });
    },
  });
  const history = defineTool({
    name: "get_equipment_history",
    description: "Return bundled equipment records and previous maintenance notes.",
    inputSchema: empty,
    effects: "pure",
    run: async (_input, ctx) => {
      record("get_equipment_history");
      if (delayMs > 0) {
        await delay(delayMs, ctx.signal);
      }
      return json({ equipment: EQUIPMENT_HISTORY });
    },
  });
  const save = defineTool({
    name: "save_report",
    description:
      "Save the inspection report locally. Severity is taken from the checklist for each matched note. The operation id is the report id.",
    inputSchema: reportSchema,
    effects: "idempotent",
    run: (input: ReportDraft, ctx: ToolContext) => {
      record(`save_report ${ctx.operationId}`);
      try {
        return json(groundReport(input, ctx.operationId));
      } catch (error) {
        throw new LarkxError({
          code: "permanent_execution_failure",
          message: error instanceof Error ? error.message : "The report did not match the notes.",
          retryable: false,
        });
      }
    },
  });
  return [notes, checklist, history, save];
}

function record(name: string): void {
  session.push(name);
}

function json(value: unknown): JsonValue {
  return JSON.parse(JSON.stringify(value)) as JsonValue;
}

function delay(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = (): void => {
      clearTimeout(timer);
      reject(
        new LarkxError({
          code: "cancelled_execution",
          message: "Equipment history read cancelled.",
          retryable: false,
        }),
      );
    };
    if (signal.aborted) {
      onAbort();
      return;
    }
    signal.addEventListener("abort", onAbort, { once: true });
  });
}
