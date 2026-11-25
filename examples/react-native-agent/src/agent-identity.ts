export const SCRIPTED_AGENT = "field-assistant-scripted";
export const LOCAL_AGENT = "field-assistant-local";
export const AGENT_VERSION = 1;

export type FieldMode = "scripted" | "local";

export function agentNameForMode(mode: FieldMode): string {
  return mode === "scripted" ? SCRIPTED_AGENT : LOCAL_AGENT;
}

/** The mode that is allowed to recover this persisted workflow name. */
export function modeForPersistedAgent(workflowName: string): FieldMode | null {
  if (workflowName === SCRIPTED_AGENT) {
    return "scripted";
  }
  if (workflowName === LOCAL_AGENT) {
    return "local";
  }
  return null;
}

export function recoveryMismatch(workflowName: string, selected: FieldMode): string | null {
  const required = modeForPersistedAgent(workflowName);
  if (required === null) {
    return `Run belongs to ${workflowName}, which this screen does not recover.`;
  }
  if (required === selected) {
    return null;
  }
  if (required === "local") {
    return "This run was started with the local Cactus model. Switch to Local model before recovering it. The scripted model will not continue it.";
  }
  return "This run was started with the scripted model. Switch to Scripted before recovering it. The local model will not continue it.";
}
