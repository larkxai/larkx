import type { ModelAdapter, ModelResponse } from "@larkx/agent";
import { cactusAdapter } from "@larkx/cactus/adapter";

import { textToolCalls } from "./text-tool.js";

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
  const { createCactusModel } = require("@larkx/cactus");
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
    capabilities: { toolCalling: true, structuredOutput: false, cancellation: true },
    async complete(request, context) {
      inner ??= cactusAdapter(cactusModel(name));
      const response = await inner.complete(request, context);
      return withTextCalls(response);
    },
  };
}

export function withTextCalls(response: ModelResponse): ModelResponse {
  if (response.calls.length > 0) {
    return response;
  }
  const calls = textToolCalls(response.message);
  if (calls.length === 0) {
    return response;
  }
  return { ...response, message: null, finish: "tool_calls", calls };
}
