import type { HostEvent } from "@larkxai/react-native";

export type OperationKind = "device" | "remote";

export interface OperationLabel {
  readonly label: string;
  readonly kind: OperationKind;
}

const TOOL_LABELS: Readonly<Record<string, OperationLabel>> = {
  read_inspection_notes: { label: "Reading inspection notes", kind: "device" },
  get_equipment_details: { label: "Reading equipment specifications", kind: "device" },
  get_previous_inspections: { label: "Reading previous inspections", kind: "device" },
  "procurement-agent": { label: "Researching replacement components", kind: "remote" },
  save_inspection_report: { label: "Saving findings", kind: "device" },
  record_part_replacement: { label: "Recording a part issue", kind: "device" },
};

/**
 * User-facing label for a real runtime event.
 * The tool name comes from the runtime observation. Unmapped events stay in the developer log.
 */
export function operationLabel(event: HostEvent): OperationLabel | null {
  if (event.type === "remote-waiting" || event.type === "remote-input-required") {
    return { label: "Waiting for remote research", kind: "remote" };
  }
  if (event.type === "remote-requested" || event.type === "remote-response") {
    return { label: "Researching replacement components", kind: "remote" };
  }
  if (event.type === "model-requested") {
    return { label: "Analyzing equipment", kind: "device" };
  }
  if (event.type === "model-committed") {
    return { label: "Identifying potential defects", kind: "device" };
  }
  if (event.type === "before-completion") {
    return { label: "Preparing inspection report", kind: "device" };
  }
  if (event.type !== "tool-requested" && event.type !== "tool-committed") {
    return null;
  }
  const named = event.toolName === undefined ? undefined : TOOL_LABELS[event.toolName];
  return named ?? null;
}
