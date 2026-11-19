import {
  createAgent,
  createScriptedModel,
  type Agent,
  type ModelAdapter,
  type ModelResponse,
} from "@larkx/agent";
import type { Engine } from "@larkx/core";
import type { JsonObject, JsonValue } from "@larkx/protocol";

import { scriptedDraft } from "./report.js";
import { inspectionTools } from "./tools.js";

export const FIELD_INSTRUCTIONS = [
  "You are a field inspection assistant on this device.",
  "Use only the registered tools. Call one tool, wait for its result, then call the next.",
  "Call get_inspection_notes, then get_maintenance_checklist, then get_equipment_history.",
  "Then call save_report. priorities must use sourceNoteId values from the notes.",
  "Do not invent costs, measurements, certifications, or notes that were not returned.",
  "After save_report succeeds, answer in one sentence and do not call another tool.",
].join(" ");

export function scriptedInspectionModel() {
  return createScriptedModel({
    id: "scripted",
    model: "scripted-inspection",
    respond(request): ModelResponse {
      const done = request.messages
        .filter((message) => message.role === "tool")
        .map((message) => message.name);
      if (!done.includes("get_inspection_notes")) {
        return call("get_inspection_notes");
      }
      if (!done.includes("get_maintenance_checklist")) {
        return call("get_maintenance_checklist");
      }
      if (!done.includes("get_equipment_history")) {
        return call("get_equipment_history");
      }
      if (!done.includes("save_report")) {
        return call("save_report", reportArguments());
      }
      return {
        message: "Saved the building inspection report on this device.",
        finish: "stop",
        calls: [],
      };
    },
  });
}

export function createInspectionAgent(
  engine: Engine,
  model: ModelAdapter,
  options?: { readonly delayMs?: number },
): Agent {
  return createAgent({
    engine,
    name: "field-inspection",
    version: 1,
    model,
    instructions: FIELD_INSTRUCTIONS,
    tools: inspectionTools({ delayMs: options?.delayMs ?? 0 }),
    maxIterations: 8,
    maxContextChars: 16_000,
  });
}

function call(name: string, args: JsonObject = {}): ModelResponse {
  return { message: null, finish: "tool_calls", calls: [{ id: name, name, arguments: args }] };
}

function reportArguments(): JsonObject {
  const draft = scriptedDraft();
  const priorities: JsonValue[] = (draft.priorities ?? []).map((item) => ({
    issue: item.issue ?? "",
    ...(item.sourceNoteId !== undefined ? { sourceNoteId: item.sourceNoteId } : {}),
  }));
  return {
    title: draft.title ?? "Building Inspection Report",
    summary: draft.summary ?? "",
    priorities,
    followUp: [...(draft.followUp ?? [])],
    routine: [...(draft.routine ?? [])],
  };
}
