import type { ModelResponse } from "@larkxai/react-native";

import { SIMULATED_REPORT } from "./equipment.js";

/**
 * Deterministic next step from committed tool results.
 * A recovered run continues at the first tool that is not already in the transcript.
 * This is a script, not a local model decision.
 */
export function scriptedInspectionResponse(
  messages: readonly unknown[],
  options?: { readonly delegate?: boolean },
): ModelResponse {
  const called = toolNames(messages);
  if (!called.has("read_inspection_notes")) {
    return call("call-notes", "read_inspection_notes", {});
  }
  if (!called.has("get_equipment_details")) {
    return call("call-spec", "get_equipment_details", { equipmentId: "pump-12" });
  }
  if (!called.has("get_previous_inspections")) {
    return call("call-history", "get_previous_inspections", { equipmentId: "pump-12" });
  }
  if (options?.delegate === true && !called.has("procurement-agent")) {
    return call("call-remote", "procurement-agent", {
      objective: "Find a compatible mechanical seal for pump 12",
      equipment: "Industrial water pump",
      component: "Mechanical seal",
    });
  }
  if (!called.has("save_inspection_report")) {
    const supplier = toolText(messages, "procurement-agent");
    const report =
      supplier === null
        ? SIMULATED_REPORT
        : `${SIMULATED_REPORT} Supplier research: ${supplier.slice(0, 500)}`;
    return call("call-report", "save_inspection_report", { report });
  }
  return {
    message: "Inspection report saved on this device.",
    finish: "stop",
    calls: [],
  };
}

function call(id: string, name: string, args: { readonly [key: string]: string }): ModelResponse {
  return {
    message: null,
    finish: "tool_calls",
    calls: [{ id, name, arguments: args }],
  };
}

function toolNames(messages: readonly unknown[]): Set<string> {
  const names = new Set<string>();
  for (const message of messages) {
    if (typeof message !== "object" || message === null || Array.isArray(message)) {
      continue;
    }
    const record = message as { readonly role?: unknown; readonly name?: unknown };
    if (record.role === "tool" && typeof record.name === "string") {
      names.add(record.name);
    }
  }
  return names;
}

function toolText(messages: readonly unknown[], name: string): string | null {
  for (const message of messages) {
    if (typeof message !== "object" || message === null || Array.isArray(message)) {
      continue;
    }
    const record = message as {
      readonly role?: unknown;
      readonly name?: unknown;
      readonly content?: unknown;
    };
    if (record.role === "tool" && record.name === name && typeof record.content === "string") {
      return record.content;
    }
  }
  return null;
}
