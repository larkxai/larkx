import type { ExecutionTarget } from "./effects.js";

export interface RuntimeCapabilities {
  readonly protocolVersion: number;
  readonly executionTargets: readonly ExecutionTarget[];
  readonly remoteDispatch: boolean;
  readonly durableTime: boolean;
  readonly storageKind: string;
}
