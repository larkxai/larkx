import { cactusHostModel, type NativeHostModel } from "@larkxai/cactus/adapter";
import { createCactusModel } from "@larkxai/cactus";

export type CactusModel = NativeHostModel;

/**
 * Optional on-device model. Import this module only when the app uses Cactus.
 * The root SDK entry does not load it. Download and init stay outside the run.
 */
export function cactusModel(options: { readonly model?: string } = {}): CactusModel {
  const created = createCactusModel(
    options.model === undefined ? undefined : { model: options.model },
  );
  return cactusHostModel(created);
}
