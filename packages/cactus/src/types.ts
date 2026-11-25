/**
 * Structural slice of cactus-react-native 1.13.1.
 * The published reference is the source of these fields. Do not add methods the SDK does not document.
 */
export interface CactusMessage {
  readonly role: "system" | "user" | "assistant";
  readonly content?: string;
}

export interface CactusToolParameters {
  readonly type: "object";
  readonly properties: Readonly<
    Record<string, { readonly type: string; readonly description: string }>
  >;
  readonly required: readonly string[];
}

export interface CactusTool {
  readonly name: string;
  readonly description: string;
  readonly parameters: CactusToolParameters;
}

export interface CactusCompleteRequest {
  readonly messages: readonly CactusMessage[];
  readonly tools?: readonly CactusTool[];
  readonly options?: {
    readonly temperature?: number;
    readonly maxTokens?: number;
    readonly forceTools?: boolean;
    readonly telemetryEnabled?: boolean;
    readonly confidenceThreshold?: number;
    readonly toolRagTopK?: number;
    readonly useVad?: boolean;
    readonly enableThinking?: boolean;
  };
}

export interface CactusFunctionCall {
  readonly name: string;
  readonly arguments: { readonly [key: string]: unknown };
}

export interface CactusCompletion {
  readonly success: boolean;
  readonly response: string;
  readonly thinking?: string;
  readonly functionCalls?: readonly CactusFunctionCall[];
  readonly cloudHandoff?: boolean;
  readonly confidence?: number;
  readonly timeToFirstTokenMs: number;
  readonly totalTimeMs: number;
  readonly prefillTokens: number;
  readonly decodeTokens: number;
  readonly totalTokens: number;
  readonly ramUsageMb?: number;
}

export interface CactusLanguageModel {
  download(params?: { onProgress?: (progress: number) => void }): Promise<void>;
  init(): Promise<void>;
  complete(params: CactusCompleteRequest): Promise<CactusCompletion>;
  stop(): Promise<void>;
  destroy(): Promise<void>;
  getModelName(): string;
}
