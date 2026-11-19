import { INSPECTION_NOTES, MAINTENANCE_CHECKLIST, type InspectionNote } from "./records.js";

export interface ReportPriority {
  readonly issue: string;
  readonly severity: "high" | "medium" | "low";
  readonly sourceNoteId: string;
}

export interface InspectionReport {
  readonly id: string;
  readonly title: string;
  readonly summary: string;
  readonly priorities: readonly ReportPriority[];
  readonly followUp: readonly string[];
  readonly routine: readonly string[];
}

export interface ReportDraft {
  readonly title?: string;
  readonly summary?: string;
  readonly priorities?: readonly {
    readonly issue?: string;
    readonly severity?: string;
    readonly sourceNoteId?: string;
  }[];
  readonly followUp?: readonly string[];
  readonly routine?: readonly string[];
}

function severityFor(noteId: string): "high" | "medium" | "low" {
  return MAINTENANCE_CHECKLIST.find((item) => item.noteId === noteId)?.severity ?? "low";
}

export function groundReport(draft: ReportDraft, operationId: string): InspectionReport {
  const matched = new Map<string, InspectionNote>();
  for (const item of draft.priorities ?? []) {
    const note = matchNote(item.sourceNoteId, item.issue);
    if (note) {
      matched.set(note.id, note);
    }
  }
  if (matched.size === 0) {
    throw new Error("save_report did not match any bundled inspection note.");
  }
  const priorities = [...matched.values()].map((note) => ({
    issue: note.text,
    severity: severityFor(note.id),
    sourceNoteId: note.id,
  }));
  priorities.sort((left, right) => rank(left.severity) - rank(right.severity));
  const summary = clean(draft.summary, 400);
  return {
    id: operationId,
    title: clean(draft.title, 80) || "Building Inspection Report",
    summary:
      summary ||
      `The notes record ${String(priorities.length)} items. This is an illustrative maintenance summary, not a certified safety assessment.`,
    priorities,
    followUp: cleanList(draft.followUp),
    routine: cleanList(draft.routine),
  };
}

export function scriptedDraft(): ReportDraft {
  return {
    title: "Building Inspection Report",
    summary:
      "Today's notes list water at the basement pump, a partly blocked exit, an overdue extinguisher, a hot electrical cabinet, HVAC-03 noise, a dark corridor, and reception paint wear.",
    priorities: INSPECTION_NOTES.map((note) => ({ sourceNoteId: note.id, issue: note.text })),
    followUp: [
      "Check the basement pump seal and dry the area.",
      "Clear emergency exit B.",
      "Inspect or replace the overdue lobby extinguisher.",
      "Read the electrical cabinet temperature against the 40 C range.",
    ],
    routine: ["Schedule reception paint with ordinary upkeep."],
  };
}

export function formatReport(report: InspectionReport): string {
  const lines = [
    report.title,
    "",
    "Summary",
    report.summary,
    "",
    "Priority maintenance issues",
    ...report.priorities.map(
      (item) => `- ${item.severity.toUpperCase()}: ${item.issue} (${item.sourceNoteId})`,
    ),
  ];
  if (report.followUp.length > 0) {
    lines.push("", "Recommended follow-up", ...report.followUp.map((item) => `- ${item}`));
  }
  if (report.routine.length > 0) {
    lines.push("", "Routine maintenance", ...report.routine.map((item) => `- ${item}`));
  }
  lines.push("", `Report saved locally. id ${report.id}`);
  lines.push("Illustrative maintenance summary. Not a certified safety assessment.");
  return lines.join("\n");
}

export function readReport(output: unknown): InspectionReport | null {
  if (!isRecord(output) || output.ok !== true || !isRecord(output.output)) {
    return null;
  }
  const report = output.output;
  if (
    typeof report.id !== "string" ||
    typeof report.title !== "string" ||
    typeof report.summary !== "string"
  ) {
    return null;
  }
  if (
    !Array.isArray(report.priorities) ||
    !Array.isArray(report.followUp) ||
    !Array.isArray(report.routine)
  ) {
    return null;
  }
  const priorities: ReportPriority[] = [];
  for (const item of report.priorities) {
    if (
      !isRecord(item) ||
      typeof item.issue !== "string" ||
      (item.severity !== "high" && item.severity !== "medium" && item.severity !== "low") ||
      typeof item.sourceNoteId !== "string"
    ) {
      return null;
    }
    priorities.push({
      issue: item.issue,
      severity: item.severity,
      sourceNoteId: item.sourceNoteId,
    });
  }
  return {
    id: report.id,
    title: report.title,
    summary: report.summary,
    priorities,
    followUp: report.followUp.filter((item): item is string => typeof item === "string"),
    routine: report.routine.filter((item): item is string => typeof item === "string"),
  };
}

function matchNote(
  sourceNoteId: string | undefined,
  issue: string | undefined,
): InspectionNote | undefined {
  if (sourceNoteId) {
    const byId = INSPECTION_NOTES.find((note) => note.id === sourceNoteId);
    if (byId) {
      return byId;
    }
  }
  const text = issue?.trim().toLowerCase() ?? "";
  if (text.length < 8) {
    return undefined;
  }
  return INSPECTION_NOTES.find((note) => {
    const noteText = note.text.toLowerCase();
    return noteText.includes(text) || text.includes(noteText.slice(0, 24));
  });
}

function clean(value: string | undefined, max: number): string {
  return (value ?? "").trim().slice(0, max);
}

function cleanList(values: readonly string[] | undefined): string[] {
  return (values ?? [])
    .filter((item) => typeof item === "string")
    .map((item) => item.trim())
    .filter((item) => item.length > 0)
    .slice(0, 8)
    .map((item) => item.slice(0, 180));
}

function rank(severity: ReportPriority["severity"]): number {
  if (severity === "high") {
    return 0;
  }
  if (severity === "medium") {
    return 1;
  }
  return 2;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
