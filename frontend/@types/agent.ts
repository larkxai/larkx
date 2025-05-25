export enum AgentMode {
  Linear = 'Linear',
  Passive = 'Passive'
}

export interface FormField {
  name: string;
  label: string;
  type: 'text' | 'email' | 'number' | 'url';
  required: boolean;
}

export interface FormAgentConfig {
  fields: FormField[];
}

export interface ReminderAgentConfig {
  message: string;
  delay: string;
}

export interface BaseAgent {
  id: string;
  flowId: string;
  type: string;
  name: string;
  mode: AgentMode;
  after?: string | null;
}

export type Agent = BaseAgent & (
  | { type: 'FormAgent'; config: FormAgentConfig }
  | { type: 'ReminderAgent'; config: ReminderAgentConfig }
);

export interface AgentFlow {
  id: string;
  name: string;
  description?: string;
  createdBy: string;
  isTemplate: boolean;
  version: number;
  agents: Agent[];
  createdAt: Date;
}

export interface Job {
  id: string;
  title: string;
  flowId: string;
  flow: AgentFlow;
}
