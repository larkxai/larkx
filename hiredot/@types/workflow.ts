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
  | "send_notification"
  | "background_check_request"
  | "background_check_status";

export type WorkflowDataType =
  | string
  | number
  | boolean
  | Date
  | Array<string | number | boolean | Date>;

export type ConditionOperator =
  | "equals"
  | "not_equals"
  | "greater_than"
  | "less_than"
  | "greater_than_equal"
  | "less_than_equal"
  | "contains"
  | "not_contains"
  | "in"
  | "not_in"
  | "exists"
  | "not_exists"
  | "matches_regex";

export type LogicalOperator = "AND" | "OR";

export interface WorkflowCondition {
  field: string;
  operator: ConditionOperator;
  value: WorkflowDataType;
}

export interface ComplexCondition {
  logic: LogicalOperator;
  conditions: (WorkflowCondition | ComplexCondition)[];
}

export type WorkflowActionConfig<T extends keyof WorkflowActionConfigs> = {
  type: T;
  config: WorkflowActionConfigs[T];
  retry?: {
    maxAttempts: number;
    backoffStrategy: "linear" | "exponential";
    initialDelay: number;
  };
  timeout?: number;
  rollback?: WorkflowAction;
};

export interface WorkflowAction {
  type: WorkflowActionType;
  config: WorkflowActionConfig<keyof WorkflowActionConfigs>;
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

export type WorkflowStepType = "action" | "form" | "quiz" | "scheduler";

export type WorkflowStep = {
  id: string;
  name: string;
  type: "form" | "quiz" | "scheduler" | "action";
  version: string;
  conditions: ComplexCondition[];
  timeout?: number;
  retryStrategy?: {
    maxAttempts: number;
    backoffStrategy: "linear" | "exponential";
  };
  nextSteps: {
    default?: string;
    conditions?: Array<{
      condition: ComplexCondition;
      then: string | string[];
      priority?: number;
    }>;
  };
  onError?: {
    action: WorkflowAction;
    nextStep?: string;
  };
  metadata?: {
    description?: string;
    tags?: string[];
    owner?: string;
    expectedDuration?: number;
  };
};

export type Action = {
  type: "send_email" | "update_status" | string;
  config: Record<string, unknown>;
  delay?: number;
};

export interface Workflow extends Metadata {
  name: string;
  description?: string;
  version: string;
  trigger: WorkflowTrigger | WorkflowTrigger[];
  enabled: boolean;
  steps: WorkflowStep[];
  globals?: {
    variables: Record<string, WorkflowDataType>;
    constants: Record<string, WorkflowDataType>;
  };
  metadata?: {
    createdBy: ID;
    lastExecuted?: ISODateString;
    executionCount: number;
    averageExecutionTime?: number;
    version: {
      current: string;
      history: Array<{
        version: string;
        timestamp: ISODateString;
        changes: string;
      }>;
    };
    stats: {
      successRate: number;
      averageCompletionTime: number;
      failurePoints: Record<string, number>;
    };
  };
  permissions?: {
    viewers: ID[];
    editors: ID[];
    admins: ID[];
  };
}

export interface BackgroundCheckConfig {
  provider: "checkr" | "hireright" | "sterling" | string;
  packageName: string;
  candidateInfo: {
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
    dateOfBirth: string;
    ssn?: string;
    address?: {
      street: string;
      city: string;
      state: string;
      zipCode: string;
      country: string;
    };
  };
  checks: Array<
    "criminal" | "education" | "employment" | "identity" | "drug" | string
  >;
  webhook?: {
    url: string;
    events: string[];
  };
}

export interface WorkflowActionConfigs {
  background_check_request: BackgroundCheckConfig;
  background_check_status: {
    reportId: string;
    status: "pending" | "completed" | "failed" | "canceled";
    results?: Record<string, unknown>;
  };
  send_notification: {
    to: string[];
    subject: string;
    message: string;
  };
}
