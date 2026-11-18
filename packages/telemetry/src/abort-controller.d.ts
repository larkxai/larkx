interface AbortSignal {
  readonly aborted: boolean;
  addEventListener(type: "abort", listener: () => void, options?: { once?: boolean }): void;
  removeEventListener(type: "abort", listener: () => void): void;
}

interface AbortController {
  readonly signal: AbortSignal;
  abort(reason?: unknown): void;
}

declare const AbortController: {
  prototype: AbortController;
  new (): AbortController;
};

declare function setTimeout(handler: () => void, timeout?: number): number;
declare function clearTimeout(id: number | undefined): void;

interface TextEncoder {
  encode(input?: string): Uint8Array;
}

declare const TextEncoder: {
  new (): TextEncoder;
};
