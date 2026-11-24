import type { ClassifiedIssue, PlanOutput, ReportOutput } from "./stages.js";

export interface ObservedStep {
  readonly stepKey: string;
  readonly status: string;
  readonly attemptCount: number;
  readonly output: unknown;
  readonly error?: { readonly message: string } | null;
}

export type ActivityState =
  "waiting" | "running" | "completed" | "recovered" | "interrupted" | "failed" | "skipped";

export interface ActivityRow {
  readonly key: string;
  readonly label: string;
  readonly state: ActivityState;
  readonly detail: string;
  readonly lines: readonly string[];
  readonly where: "LOCAL";
}

const STAGES = [
  { key: "extract", label: "Extract issues" },
  { key: "classify", label: "Classify priorities" },
  { key: "plan", label: "Create action plan" },
  { key: "report", label: "Generate report" },
] as const;

export function activityRows(
  steps: readonly ObservedStep[],
  runStatus?: string | null,
): ActivityRow[] {
  const finished = isFinished(runStatus);
  return STAGES.map((stage) => {
    const step = [...steps].reverse().find((item) => item.stepKey === stage.key);
    const state: ActivityState = step ? stateOf(step) : finished ? "skipped" : "waiting";
    const shown = describe(stage.key, state, step?.output, step?.error?.message);
    return {
      key: stage.key,
      label: stage.label,
      state,
      detail: shown.detail,
      lines: shown.lines,
      where: "LOCAL",
    };
  });
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

export function reportFromSteps(steps: readonly { output: unknown }[]): ReportOutput | null {
  for (let index = steps.length - 1; index >= 0; index -= 1) {
    const report = readReport(steps[index]?.output);
    if (report) {
      return report;
    }
  }
  return null;
}

function describe(
  key: string,
  state: ActivityState,
  output: unknown,
  errorMessage?: string,
): { detail: string; lines: readonly string[] } {
  if (state === "waiting") return { detail: "Waiting", lines: [] };
  if (state === "skipped") return { detail: "Skipped", lines: [] };
  if (state === "running") return { detail: runningDetail(key), lines: [] };
  if (state === "interrupted") return { detail: "Interrupted", lines: [] };
  if (state === "failed") {
    return {
      detail: errorMessage && errorMessage.length > 0 ? errorMessage : "Failed",
      lines: [],
    };
  }
  if (key === "extract") {
    const issues = issuesOf(output);
    return { detail: count(issues.length, "issue extracted", "issues extracted"), lines: issues };
  }
  if (key === "classify") {
    const issues = classifiedOf(output);
    return {
      detail: count(issues.length, "issue classified", "issues classified"),
      lines: issues.map((issue) => `${issue.severity.toUpperCase()} · ${issue.text}`),
    };
  }
  if (key === "plan") {
    const actions = actionsOf(output);
    return { detail: count(actions.length, "task created", "tasks created"), lines: actions };
  }
  const report = readReport(output);
  return { detail: report ? "Report ready" : "Completed", lines: [] };
}

function runningDetail(key: string): string {
  if (key === "plan") return "Generating recommendations...";
  if (key === "report") return "Generating report...";
  if (key === "classify") return "Classifying...";
  return "Reading the notes...";
}

function stateOf(step: ObservedStep): ActivityState {
  if (step.status === "COMPLETED" && step.attemptCount > 1) return "recovered";
  if (step.status === "COMPLETED") return "completed";
  if (step.status === "UNKNOWN_OUTCOME" || step.status === "CANCELLED") return "interrupted";
  if (step.status === "FAILED") return "failed";
  if (
    step.status === "RUNNING" ||
    step.status === "PENDING" ||
    step.status === "RETRY_SCHEDULED" ||
    step.status === "WAITING_REMOTE"
  ) {
    return "running";
  }
  return "waiting";
}

function isFinished(status: string | null | undefined): boolean {
  return (
    status === "COMPLETED" || status === "FAILED" || status === "CANCELLED" || status === "BLOCKED"
  );
}

function count(value: number, one: string, many: string): string {
  return `${String(value)} ${value === 1 ? one : many}`;
}

function issuesOf(output: unknown): string[] {
  const record = asRecord(output);
  if (!record || !Array.isArray(record.issues)) return [];
  const texts: string[] = [];
  for (const item of record.issues) {
    const issue = asRecord(item);
    if (issue && typeof issue.text === "string" && issue.text.length > 0) {
      texts.push(issue.text);
    }
  }
  return texts;
}

function classifiedOf(output: unknown): ClassifiedIssue[] {
  const record = asRecord(output);
  if (!record || !Array.isArray(record.issues)) return [];
  const issues: ClassifiedIssue[] = [];
  for (const item of record.issues) {
    const issue = asRecord(item);
    if (!issue || typeof issue.text !== "string" || !isSeverity(issue.severity)) continue;
    issues.push({
      text: issue.text,
      severity: issue.severity,
      rule: typeof issue.rule === "string" ? issue.rule : null,
    });
  }
  return issues;
}

function actionsOf(output: unknown): string[] {
  const record = asRecord(output) as PlanOutput | null;
  if (!record || !Array.isArray(record.actions)) return [];
  return record.actions.filter((action): action is string => typeof action === "string");
}

function readReport(output: unknown): ReportOutput | null {
  const record = asRecord(output);
  if (!record || record.title !== "Building Inspection Report" || typeof record.body !== "string") {
    return null;
  }
  if (typeof record.summary !== "string" || typeof record.model !== "string") return null;
  if (!Array.isArray(record.issues) || !Array.isArray(record.actions)) return null;
  return {
    title: record.title,
    summary: record.summary,
    body: record.body,
    issues: classifiedOf(record),
    actions: record.actions.filter((action): action is string => typeof action === "string"),
    model: record.model,
  };
}

function isSeverity(value: unknown): value is ClassifiedIssue["severity"] {
  return value === "high" || value === "medium" || value === "low" || value === "unspecified";
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}
