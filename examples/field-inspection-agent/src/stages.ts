import type { Severity } from "./rules.js";
import { ruleLines } from "./rules.js";

export interface Issue {
  readonly text: string;
}

export interface ClassifiedIssue {
  readonly text: string;
  readonly severity: Severity;
  readonly rule: string | null;
}

export interface ExtractOutput {
  readonly issues: Issue[];
  readonly model: string;
}

export interface ClassifyOutput {
  readonly issues: ClassifiedIssue[];
  readonly model: string;
}

export interface PlanOutput {
  readonly actions: string[];
  readonly model: string;
}

export interface ReportOutput {
  readonly title: string;
  readonly summary: string;
  readonly body: string;
  readonly issues: ClassifiedIssue[];
  readonly actions: string[];
  readonly model: string;
}

export const EXTRACT_SYSTEM = [
  "Extract maintenance issues.",
  "Reply with one issue per line, each line starting with a dash.",
  "Use only problems written in the notes.",
  "Do not add an introduction.",
].join(" ");

export const CLASSIFY_SYSTEM = [
  "Classify each issue using these rules.",
  "Reply with one line per issue: - issue | high",
  "The severity word must be high, medium, low, or unspecified.",
  "Do not add issues.",
  `Rules: ${ruleLines()}`,
].join(" ");

export const PLAN_SYSTEM = [
  "Write one follow-up action per line, each line starting with a dash.",
  "Use only the classified issues.",
  "Do not invent costs, measurements, or certifications.",
].join(" ");

export const REPORT_SYSTEM = [
  "Write a short inspection report.",
  "First line is a one-sentence summary.",
  "Then list the issues and the actions you were given.",
  "Do not invent costs, measurements, or certifications.",
  "End with: Illustrative maintenance summary. Not a certified safety assessment.",
].join(" ");

export const EXAMPLE_NOTES =
  "Found water leakage near the basement pump, an obstructed emergency exit, and unusual noise from HVAC-03. Create an inspection report.";

export function parseIssues(text: string): string[] {
  if (hasList(text)) {
    const bullets = bulletLines(text);
    if (bullets.length > 0) {
      return bullets;
    }
  }
  const loose = loosePieces(text);
  return loose.length > 0 ? loose : bulletLines(text);
}

export function parseClassified(text: string): ClassifiedIssue[] {
  return bulletLines(text).map(classifyLine);
}

export function parseActions(text: string): string[] {
  const bullets = bulletLines(text);
  return bullets.length > 0 ? bullets : loosePieces(text);
}

export function firstLine(text: string): string {
  const line = text
    .split(/\r?\n/)
    .map((item) => item.trim())
    .find((item) => item.length > 0);
  return (line ?? "").slice(0, 400);
}

function classifyLine(line: string): ClassifiedIssue {
  const match = line.match(/^(.*?)(?:\s*\|\s*|\s+-\s+)(high|medium|low|unspecified)\s*$/i);
  if (!match) {
    return { text: cleanPiece(line), severity: "unspecified", rule: null };
  }
  const severity = match[2]?.toLowerCase();
  return {
    text: cleanPiece(match[1] ?? line),
    severity: isSeverity(severity) ? severity : "unspecified",
    rule: null,
  };
}

function hasList(text: string): boolean {
  const raw = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  return raw.some((line) => bulletPrefix(line)) || raw.length > 1;
}

function bulletLines(text: string): string[] {
  const raw = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  const hasBullets = raw.some((line) => bulletPrefix(line));
  const picked = raw.filter((line) => (hasBullets ? bulletPrefix(line) : true));
  return dedupe(
    picked.map((line) => cleanPiece(line.replace(/^(?:[-*•]|\d+[.)])\s+/, ""))).filter(keepLine),
  ).slice(0, 8);
}

function loosePieces(text: string): string[] {
  return dedupe(
    text
      .split(/\n+|(?<=[.!?])\s+|,\s+|\s+and\s+/i)
      .map(cleanPiece)
      .filter(keepLine),
  ).slice(0, 8);
}

function bulletPrefix(line: string): boolean {
  return /^(?:[-*•]|\d+[.)])\s+/.test(line);
}

function keepLine(line: string): boolean {
  return line.length >= 8 && !/^(here|sure|okay|ok|certainly|the following)\b/i.test(line);
}

function cleanPiece(value: string): string {
  return value
    .replace(/^[-*•]\s*/, "")
    .replace(/^(?:and|then)\s+/i, "")
    .replace(/[.]+$/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 180);
}

function dedupe(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const key = value.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(value);
  }
  return result;
}

function isSeverity(value: string | undefined): value is Severity {
  return value === "high" || value === "medium" || value === "low" || value === "unspecified";
}
