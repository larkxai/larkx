export interface ObservedStep {
  readonly stepKey: string;
  readonly status: string;
  readonly attemptCount: number;
  readonly output: unknown;
}

export type ActivityState =
  "pending" | "running" | "completed" | "recovered" | "interrupted" | "blocked" | "skipped";

export interface ActivityRow {
  readonly label: string;
  readonly state: ActivityState;
  readonly where: "LOCAL";
}

const READS = [
  "get_inspection_notes",
  "get_maintenance_checklist",
  "get_equipment_history",
] as const;

export function activityRows(
  steps: readonly ObservedStep[],
  runStatus?: string | null,
): ActivityRow[] {
  const finished = isFinished(runStatus);
  return [
    toolRow("Read inspection notes", "get_inspection_notes", steps, finished),
    toolRow("Check maintenance requirements", "get_maintenance_checklist", steps, finished),
    toolRow("Review equipment history", "get_equipment_history", steps, finished),
    generateRow(steps, finished),
    toolRow("Save report", "save_report", steps, finished),
  ];
}

export function recoveryStats(
  steps: readonly ObservedStep[],
  events: readonly { readonly type: string }[],
): { readonly restored: number; readonly repeated: number; readonly recoveries: number } {
  return {
    restored: steps.filter((step) => step.status === "COMPLETED" && step.attemptCount <= 1).length,
    repeated: steps.filter((step) => step.attemptCount > 1).length,
    recoveries: events.filter((event) => event.type === "WORKFLOW_RECOVERED").length,
  };
}

function toolRow(
  label: string,
  name: string,
  steps: readonly ObservedStep[],
  finished: boolean,
): ActivityRow {
  const step = [...steps].reverse().find((item) => toolName(item) === name);
  return { label, state: step ? stateOf(step) : unfinished(finished), where: "LOCAL" };
}

function generateRow(steps: readonly ObservedStep[], finished: boolean): ActivityRow {
  const models = steps.filter((step) => step.stepKey.startsWith("model-"));
  const readsDone = READS.every((name) =>
    steps.some((step) => toolName(step) === name && step.status === "COMPLETED"),
  );
  const open = models.find((step) => isOpen(step.status));
  if (open && readsDone) {
    return { label: "Generate report", state: stateOf(open), where: "LOCAL" };
  }
  const produced = [...models].reverse().find((step) => {
    const output = record(step.output);
    const askedToSave = callsNamed(output).includes("save_report");
    return askedToSave || (output?.finish === "stop" && readsDone);
  });
  if (produced && produced.status === "COMPLETED") {
    return { label: "Generate report", state: stateOf(produced), where: "LOCAL" };
  }
  return { label: "Generate report", state: unfinished(finished), where: "LOCAL" };
}

function unfinished(finished: boolean): ActivityState {
  return finished ? "skipped" : "pending";
}

function isFinished(status: string | null | undefined): boolean {
  return (
    status === "COMPLETED" || status === "FAILED" || status === "CANCELLED" || status === "BLOCKED"
  );
}

function stateOf(step: ObservedStep): ActivityState {
  if (step.status === "COMPLETED" && step.attemptCount > 1) {
    return "recovered";
  }
  if (step.status === "COMPLETED") {
    return "completed";
  }
  if (step.status === "UNKNOWN_OUTCOME" || step.status === "CANCELLED") {
    return "interrupted";
  }
  if (step.status === "FAILED") {
    return "blocked";
  }
  if (isOpen(step.status)) {
    return "running";
  }
  return "pending";
}

function isOpen(status: string): boolean {
  return (
    status === "RUNNING" ||
    status === "PENDING" ||
    status === "RETRY_SCHEDULED" ||
    status === "WAITING_REMOTE"
  );
}

function toolName(step: ObservedStep): string | null {
  const output = record(step.output);
  return typeof output?.name === "string" ? output.name : null;
}

function callsNamed(output: Record<string, unknown> | null): string[] {
  if (!output || !Array.isArray(output.calls)) {
    return [];
  }
  return output.calls
    .map((call) =>
      record(call) && typeof record(call)?.name === "string" ? String(record(call)?.name) : "",
    )
    .filter((name) => name.length > 0);
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}
