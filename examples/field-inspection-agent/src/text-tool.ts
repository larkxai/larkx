import type { ToolCall } from "@larkx/agent";
import type { JsonObject } from "@larkx/protocol";

const TOOL_NAMES = [
  "get_inspection_notes",
  "get_maintenance_checklist",
  "get_equipment_history",
  "save_report",
] as const;

export function textToolCalls(
  message: string | null,
  allowed: readonly string[] = TOOL_NAMES,
): ToolCall[] {
  if (message === null || message.trim().length === 0) {
    return [];
  }
  const calls: ToolCall[] = [];
  for (const value of extractObjects(message)) {
    if (calls.length >= 4 || !isRecord(value) || typeof value.name !== "string") {
      continue;
    }
    if (!allowed.includes(value.name)) {
      continue;
    }
    const raw = isRecord(value.arguments)
      ? value.arguments
      : isRecord(value.args)
        ? value.args
        : null;
    const args = raw === null ? null : asJsonObject(raw);
    if (args === null) {
      continue;
    }
    calls.push({
      id: `text-${String(calls.length)}`,
      name: value.name,
      arguments: args,
    });
  }
  return calls;
}

function extractObjects(text: string): unknown[] {
  const found: unknown[] = [];
  for (let start = 0; start < text.length; start += 1) {
    if (text[start] !== "{") {
      continue;
    }
    const end = endOfObject(text, start);
    if (end === null) {
      continue;
    }
    try {
      found.push(JSON.parse(text.slice(start, end + 1)) as unknown);
    } catch {
      // Prose can contain a brace that is not JSON.
    }
    start = end;
  }
  return found;
}

function endOfObject(text: string, start: number): number | null {
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let index = start; index < text.length; index += 1) {
    const char = text[index];
    if (inString) {
      if (escape) {
        escape = false;
      } else if (char === "\\") {
        escape = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }
    if (char === '"') {
      inString = true;
    } else if (char === "{") {
      depth += 1;
    } else if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return index;
      }
    }
  }
  return null;
}

function asJsonObject(value: Record<string, unknown>): JsonObject | null {
  try {
    const parsed = JSON.parse(JSON.stringify(value)) as unknown;
    if (!isRecord(parsed)) {
      return null;
    }
    return parsed as JsonObject;
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
