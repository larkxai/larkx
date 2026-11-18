import { CactusLM, type CactusLMCompleteParams } from "cactus-react-native";

import { CACTUS_DEFAULT_MODEL } from "./adapter.js";
import type { CactusLanguageModel } from "./types.js";

/**
 * Construct the published `CactusLM` class.
 * Download and `init` stay outside the agent loop. `complete` also initializes
 * a downloaded model, which is the SDK's documented behavior.
 */
export function createCactusModel(params?: { readonly model?: string }): CactusLanguageModel {
  const model = new CactusLM({ model: params?.model ?? CACTUS_DEFAULT_MODEL });
  return {
    download: (options) => model.download(options),
    init: () => model.init(),
    complete: (request) => model.complete(request as CactusLMCompleteParams),
    stop: () => model.stop(),
    getModelName: () => model.getModelName(),
  };
}
