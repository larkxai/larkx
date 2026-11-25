import type { ModelResponse } from "@larkxai/react-native";

const REPORT =
  "Pump 12 needs a seal inspection and a filter change. Vibration is above the local limit.";

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
  if (options?.delegate === true && !called.has("procurement-agent")) {
    return call("call-remote", "procurement-agent", {
      objective: "Find a compatible mechanical seal for pump 12",
      equipment: "Industrial water pump",
      component: "Mechanical seal",
    });
  }
  if (!called.has("save_inspection_report")) {
    return call("call-report", "save_inspection_report", { report: REPORT });
  }
  if (!called.has("record_part_replacement")) {
    return call("call-seal", "record_part_replacement", { part: "mechanical-seal" });
  }
  return {
    message: "Pump 12 needs a seal inspection and a filter change.",
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
    const role = record.role;
    const name = record.name;
    if (role === "tool" && typeof name === "string") {
      names.add(name);
    }
  }
  return names;
}
