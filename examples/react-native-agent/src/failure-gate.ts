/**
 * Development-only barrier for the field-inspection demo.
 * This module is not part of the published SDK.
 */
const FAILURE_BOUNDARIES = [
  "before-model",
  "during-model",
  "after-model-commit",
  "before-tool",
  "during-idempotent-tool",
  "during-non-idempotent-tool",
  "after-tool-commit",
  "before-completion",
] as const;

type FailureBoundary = (typeof FAILURE_BOUNDARIES)[number];

class FailureGate {
  private armed: FailureBoundary | null = null;
  private held: FailureBoundary | null = null;
  private releaseHeld: (() => void) | null = null;

  arm(boundary: FailureBoundary | null): void {
    this.armed = boundary;
  }

  armedBoundary(): FailureBoundary | null {
    return this.armed;
  }

  heldBoundary(): FailureBoundary | null {
    return this.held;
  }

  async reach(boundary: FailureBoundary): Promise<void> {
    if (this.armed !== boundary) {
      return;
    }
    this.armed = null;
    this.held = boundary;
    await new Promise<void>((resolve) => {
      this.releaseHeld = resolve;
    });
    this.held = null;
    this.releaseHeld = null;
  }

  release(): void {
    this.releaseHeld?.();
  }
}

export { FAILURE_BOUNDARIES, FailureGate };
export type { FailureBoundary };
