import { createAgent, createScriptedModel, type Agent, type ModelResponse } from "@larkxai/agent";
import { cactusAdapter } from "@larkxai/cactus/adapter";
import type { Engine } from "@larkxai/core";

import { renovationTools } from "./tools";

type CactusLanguageModel = Parameters<typeof cactusAdapter>[0];

declare const require: (id: string) => {
  createCactusModel(params?: { readonly model?: string }): CactusLanguageModel;
};

const CACHE = "__larkxRenovationAgents";
const MODEL = "__larkxCactusModel";

export interface RenovationAgents {
  readonly test: Agent;
  readonly device: Agent;
}

interface CacheGlobal {
  [CACHE]?: RenovationAgents;
  [MODEL]?: CactusLanguageModel;
}

export function cactusModel(): CactusLanguageModel {
  const global = globalThis as CacheGlobal;
  const existing = global[MODEL];
  if (existing) {
    return existing;
  }
  // A static import of @larkxai/cactus evaluates CactusLM before Nitro installs JSI.
  const { createCactusModel } = require("@larkxai/cactus");
  const created = createCactusModel({ model: "qwen3-0.6b" });
  global[MODEL] = created;
  return created;
}

export function cactusModelLabel(): string {
  const existing = (globalThis as CacheGlobal)[MODEL];
  if (!existing) {
    return "qwen3-0.6b";
  }
  try {
    return existing.getModelName();
  } catch {
    return "qwen3-0.6b";
  }
}

export function renovationAgents(engine: Engine): RenovationAgents {
  const global = globalThis as CacheGlobal;
  const existing = global[CACHE];
  if (existing) {
    engine.register(existing.test.workflow);
    engine.register(existing.device.workflow);
    return existing;
  }
  const created: RenovationAgents = {
    test: createAgent({
      engine,
      name: "renovation-test",
      version: 1,
      model: scriptedRenovation(),
      instructions: "Follow the registered tools and save one plan.",
      tools: renovationTools({ delaySearchMs: 8_000 }),
      maxIterations: 8,
    }),
    device: createAgent({
      engine,
      name: "renovation-agent",
      version: 1,
      model: cactusAdapter(cactusModel()),
      instructions: DEVICE_INSTRUCTIONS,
      tools: renovationTools({ delaySearchMs: 0 }),
      maxIterations: 8,
      maxContextChars: 8_000,
    }),
  };
  global[CACHE] = created;
  return created;
}

export function clearRenovationAgents(): void {
  delete (globalThis as CacheGlobal)[CACHE];
}

const DEVICE_INSTRUCTIONS = [
  "You are a home renovation assistant running on this device.",
  "Use only the registered tools. Do not invent furniture prices.",
  "Call get_room_info, get_budget, and search_furniture before save_plan.",
  "save_plan takes title, summary, items (array of strings), and totalCost (number).",
  "Keep totalCost within the budget from get_budget.",
  "After save_plan succeeds, answer in plain text and do not call another tool.",
].join(" ");

function scriptedRenovation() {
  return createScriptedModel({
    id: "scripted",
    model: "scripted-renovation",
    respond(request): ModelResponse {
      const completed = request.messages.filter((message) => message.role === "tool").length;
      if (completed === 0) {
        return call("get_room_info", {});
      }
      if (completed === 1) {
        return call("get_budget", {});
      }
      if (completed === 2) {
        return call("search_furniture", { query: "sofa" });
      }
      if (completed === 3) {
        return call("save_plan", {
          title: "Living room",
          summary: "Keep the oak floor. Add a linen sofa, curtains, and a lamp.",
          items: ["Linen sofa", "Linen curtains", "Floor lamp"],
          totalCost: 1105,
        });
      }
      return {
        message: "Saved a living-room plan for $1,105, under the $2,000 budget.",
        finish: "stop",
        calls: [],
      };
    },
  });
}

function call(name: string, args: ModelResponse["calls"][number]["arguments"]): ModelResponse {
  return { message: null, finish: "tool_calls", calls: [{ id: name, name, arguments: args }] };
}
