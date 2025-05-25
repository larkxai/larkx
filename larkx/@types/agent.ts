export type AgentType = "FormAgent" | "ReminderAgent" | "SchedulerAgent";

export interface BaseAgent {
  id: string;
  jobId?: string;
  type: AgentType;
  after?: string | null;
  isPassive?: boolean;
  agentName?: string;
}

export interface FormAgentConfig {
  fields: {
    name: string;
    label: string;
    type: "text" | "email" | "number" | "boolean" | "url";
    required?: boolean;
  }[];
}

export interface ReminderAgentConfig {
  message: string;
  delay: string;
}

export type AgentConfig =
  | { type: "FormAgent"; config: FormAgentConfig }
  | { type: "ReminderAgent"; config: ReminderAgentConfig };

export type Agent = BaseAgent &
  (
    | { type: "FormAgent"; config: FormAgentConfig }
    | { type: "ReminderAgent"; config: ReminderAgentConfig }
  );
