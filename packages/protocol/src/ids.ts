export const RUN_ID_MAX_LENGTH = 200;
export const STEP_KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
export const WORKFLOW_NAME_PATTERN = /^[a-z][a-z0-9-]{0,63}$/;
export const HANDLER_NAME_PATTERN = /^[a-z][a-z0-9-]{0,63}$/;

// Identifiers must not contain NUL or other ASCII control characters.
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/;

export function validateRunId(runId: string): string | undefined {
  if (runId.length === 0 || runId.length > RUN_ID_MAX_LENGTH) {
    return `Run id must be 1-${String(RUN_ID_MAX_LENGTH)} characters.`;
  }
  if (CONTROL_CHARS.test(runId) || runId.trim() !== runId) {
    return "Run id must not contain whitespace or control characters.";
  }
  return undefined;
}

export function validateStepKey(stepKey: string): string | undefined {
  if (!STEP_KEY_PATTERN.test(stepKey)) {
    return "Step key must match /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.";
  }
  return undefined;
}

export function validateWorkflowName(name: string): string | undefined {
  if (!WORKFLOW_NAME_PATTERN.test(name)) {
    return "Workflow name must match /^[a-z][a-z0-9-]{0,63}$/.";
  }
  return undefined;
}

export function validateWorkflowVersion(version: number): string | undefined {
  if (!Number.isInteger(version) || version < 1) {
    return "Workflow version must be an integer greater than or equal to 1.";
  }
  return undefined;
}

export function validateHandlerName(name: string): string | undefined {
  if (!HANDLER_NAME_PATTERN.test(name)) {
    return "Handler name must match /^[a-z][a-z0-9-]{0,63}$/.";
  }
  return undefined;
}
