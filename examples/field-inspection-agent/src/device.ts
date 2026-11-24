import type { ModelAdapter } from "@larkxai/agent";
import { cactusAdapter } from "@larkxai/cactus/adapter";

export const DEFAULT_MODEL = "qwen3-0.6b";

type CactusLanguageModel = Parameters<typeof cactusAdapter>[0];

declare const require: (id: string) => {
  createCactusModel(params?: { readonly model?: string }): CactusLanguageModel;
};

const MODEL = "__larkxFieldModel";

interface Cache {
  [MODEL]?: CactusLanguageModel;
}

export function cactusModel(name = DEFAULT_MODEL): CactusLanguageModel {
  const global = globalThis as Cache;
  const existing = global[MODEL];
  if (existing) {
    return existing;
  }
  const { createCactusModel } = require("@larkxai/cactus");
  const created = createCactusModel({ model: name });
  global[MODEL] = created;
  return created;
}

export function fieldDeviceModel(name = DEFAULT_MODEL): ModelAdapter {
  let inner: ModelAdapter | null = null;
  return {
    id: "cactus",
    get model() {
      return inner?.model ?? name;
    },
    capabilities: { toolCalling: false, structuredOutput: false, cancellation: true },
    async complete(request, context) {
      inner ??= cactusAdapter(cactusModel(name));
      return inner.complete(request, context);
    },
  };
}
