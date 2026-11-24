import type { ModelAdapter } from "@larkx/agent";
import { cactusAdapter } from "@larkx/cactus/adapter";

export const DEFAULT_MODEL = "qwen3-0.6b";

type CactusLanguageModel = Parameters<typeof cactusAdapter>[0];

declare const require: (id: string) => {
  createCactusModel(params?: { readonly model?: string }): CactusLanguageModel;
};

const MODEL = "__larkxFieldModel";
const READY = "__larkxFieldModelReady";

interface Cache {
  [MODEL]?: CactusLanguageModel;
  [READY]?: Promise<void>;
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

/** Load the on-device model once. A second caller waits for the same `init()`. */
export function prepareCactus(name = DEFAULT_MODEL): Promise<void> {
  const global = globalThis as Cache;
  const existing = global[READY];
  if (existing) {
    return existing;
  }
  const pending = cactusModel(name)
    .init()
    .then(() => undefined)
    .catch((error: unknown) => {
      if (global[READY] === pending) {
        delete global[READY];
      }
      throw error;
    });
  global[READY] = pending;
  return pending;
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
