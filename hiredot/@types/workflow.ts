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

export type QuestionType = 
  | "text"
  | "textarea"
  | "select"
  | "multiselect"
  | "checkbox"
  | "radio"
  | "date"
  | "time"
  | "datetime";

export interface FormQuestionValidation {
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  customValidation?: (value: string | boolean | string[]) => boolean;
}

export interface FormQuestion {
  id: string;
  type: QuestionType;
  question: string;
  required: boolean;
  options?: string[];
  validation?: FormQuestionValidation;
  helpText?: string;
}

export type WorkflowStepType = 
  | "action"
  | "form"
  | "quiz"
  | "scheduler";

export interface WorkflowStep {
  id: ID;
  name: string;
  type: WorkflowStepType;
  conditions: WorkflowCondition[];
  actions?: WorkflowAction[];
  form?: {
    title?: string;
    description?: string;
    questions: FormQuestion[];
    submitButtonText?: string;
    cancelButtonText?: string;
    timeLimit?: number; // in minutes
  };
  quiz?: {
    title: string;
    description?: string;
    questions: FormQuestion[];
    passingScore: number;
    timeLimit: number; // in minutes
  };
  scheduler?: {
    title?: string;
    description?: string;
    availableSlots: {
      startTime: ISODateString;
      endTime: ISODateString;
      interviewers: ID[];
    }[];
    duration: number; // in minutes
    maxOptions?: number;
  };
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
