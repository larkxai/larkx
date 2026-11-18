import { LarkxError } from "@larkx/core";
import { defineTool, type Tool, type ToolContext } from "@larkx/agent";

import { BUDGET, ROOM, searchCatalog } from "./catalog";

const session: string[] = [];

export function sessionCalls(): readonly string[] {
  return session;
}

export function clearSessionCalls(): void {
  session.length = 0;
}

const objectSchema = {
  type: "object" as const,
  properties: {},
  additionalProperties: false,
};

const planSchema = {
  type: "object" as const,
  properties: {
    title: { type: "string" as const, description: "Short plan title" },
    summary: { type: "string" as const, description: "What will change in the room" },
    items: {
      type: "array" as const,
      description: "Furniture and material names",
      items: { type: "string" as const },
    },
    totalCost: { type: "number" as const, description: "Total cost in USD" },
  },
  required: ["title", "summary", "items", "totalCost"],
  additionalProperties: false,
};

export function renovationTools(options: { readonly delaySearchMs: number }): Tool[] {
  const room = defineTool({
    name: "get_room_info",
    description: "Read the predefined living-room measurements.",
    inputSchema: objectSchema,
    effects: "pure",
    run: () => {
      record("get_room_info");
      return ROOM;
    },
  });
  const budget = defineTool({
    name: "get_budget",
    description: "Read the available renovation budget.",
    inputSchema: objectSchema,
    effects: "pure",
    run: () => {
      record("get_budget");
      return BUDGET;
    },
  });
  const search = defineTool({
    name: "search_furniture",
    description: "Search the bundled furniture catalog.",
    inputSchema: {
      type: "object",
      properties: { query: { type: "string", description: "Name or tag to search" } },
      required: ["query"],
      additionalProperties: false,
    },
    effects: "pure",
    run: async (input: { query: string }, ctx) => {
      record("search_furniture");
      if (options.delaySearchMs > 0) {
        await delay(options.delaySearchMs, ctx.signal);
      }
      return { query: input.query, items: searchCatalog(input.query) };
    },
  });
  const save = defineTool({
    name: "save_plan",
    description: "Save the renovation plan locally. The operation id is the plan id.",
    inputSchema: planSchema,
    effects: "idempotent",
    run: (
      input: { title: string; summary: string; items: string[]; totalCost: number },
      ctx: ToolContext,
    ) => {
      record(`save_plan ${ctx.operationId}`);
      return { id: ctx.operationId, ...input };
    },
  });
  return [room, budget, search, save];
}

function record(name: string): void {
  session.push(name);
}

function delay(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = (): void => {
      clearTimeout(timer);
      reject(
        new LarkxError({
          code: "cancelled_execution",
          message: "Search cancelled.",
          retryable: false,
        }),
      );
    };
    if (signal.aborted) {
      onAbort();
      return;
    }
    signal.addEventListener("abort", onAbort, { once: true });
  });
}
