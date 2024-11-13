import { Metadata, ID, ISODateString } from "./common";

export type WorkflowTrigger =
  | "candidate_applied"
  | "status_changed"
  | "interview_scheduled"
  | "offer_created"
  | "custom";

export type WorkflowActionType =
  | "send_email"
  | "update_status"
  | "assign_task"
  | "schedule_interview"
  | "send_notification";

export interface WorkflowCondition {
  field: string;
  operator: "equals" | "not_equals" | "contains" | "greater_than" | "less_than";
  value: string | number | boolean;
}

export type WorkflowActionConfig = {
  send_email: {
    to: string;
    subject: string;
    body: string;
  };
  update_status: {
    status: string;
  };
  assign_task: {
    assignee: ID;
    title: string;
    description?: string;
    dueDate?: ISODateString;
  };
  schedule_interview: {
    interviewers: ID[];
    duration: number;
    type: string;
  };
  send_notification: {
    message: string;
    recipients: ID[];
  };
};

export interface WorkflowAction {
  type: WorkflowActionType;
  config: WorkflowActionConfig[keyof WorkflowActionConfig];
  delay?: number;
}

export interface WorkflowStep {
  id: ID;
  name: string;
  conditions: WorkflowCondition[];
  actions: WorkflowAction[];
  nextSteps?: ID[];
}

export interface Workflow extends Metadata {
  name: string;
  description?: string;
  trigger: WorkflowTrigger;
  enabled: boolean;
  steps: WorkflowStep[];
  metadata?: {
    createdBy: ID;
    lastExecuted?: ISODateString;
    executionCount: number;
    averageExecutionTime?: number;
  };
}
