import type { ModelAdapter, ModelResponse } from "@larkx/agent";

import { severityFor } from "./rules.js";
import {
  CLASSIFY_SYSTEM,
  EXTRACT_SYSTEM,
  parseIssues,
  PLAN_SYSTEM,
  REPORT_SYSTEM,
} from "./stages.js";

const calls: string[] = [];

export function stageCalls(): readonly string[] {
  return calls;
}

export function clearStageCalls(): void {
  calls.length = 0;
}

/** Labeled test double. It reads the stage prompt and the supplied text. It does not call Cactus. */
export function scriptedInspectionModel(): ModelAdapter {
  return {
    id: "scripted",
    model: "scripted-inspection",
    capabilities: { toolCalling: false, structuredOutput: false, cancellation: true },
    async complete(request, context): Promise<ModelResponse> {
      if (context.signal.aborted) {
        throw new Error("Model call cancelled.");
      }
      const system = request.messages.find((message) => message.role === "system");
      const user = [...request.messages].reverse().find((message) => message.role === "user");
      const instruction = system?.role === "system" ? system.content : "";
      const data = user?.role === "user" ? user.content : "";
      const stage = stageName(instruction);
      calls.push(stage);
      return { message: reply(stage, data), finish: "stop", calls: [] };
    },
  };
}

function stageName(instruction: string): string {
  if (instruction === EXTRACT_SYSTEM) return "extract";
  if (instruction === CLASSIFY_SYSTEM) return "classify";
  if (instruction === PLAN_SYSTEM) return "plan";
  if (instruction === REPORT_SYSTEM) return "report";
  return "unknown";
}

function reply(stage: string, data: string): string {
  if (stage === "extract") {
    return parseIssues(stripRequest(data))
      .map((issue) => `- ${issue}`)
      .join("\n");
  }
  if (stage === "classify") {
    return parseIssues(data)
      .map((issue) => {
        const judged = severityFor(issue);
        return `- ${issue} | ${judged.severity}`;
      })
      .join("\n");
  }
  if (stage === "plan") {
    return parseIssues(data)
      .map((issue) => `- Check: ${issue.split("|")[0]?.trim() ?? issue}`)
      .join("\n");
  }
  const issues = data
    .split("\n")
    .filter((line) => line.startsWith("- "))
    .map((line) => line.slice(2));
  const first = issues[0]?.split("|")[0]?.trim() || "the notes you entered";
  return [
    `Follow up on ${first}.`,
    ...issues.map((issue) => `- ${issue}`),
    "Illustrative maintenance summary. Not a certified safety assessment.",
  ].join("\n");
}

function stripRequest(notes: string): string {
  return notes.replace(/\bcreate an inspection report\.?$/i, "").trim();
}
