import { WorkflowActionType, WorkflowTrigger } from "./workflow";

export type ResourceType =
  | "job"
  | "candidate"
  | "interview"
  | "report"
  | "user"
  | "department";

export type PermissionAction =
  | "create"
  | "read"
  | "update"
  | "delete"
  | "manage"
  | "schedule"
  | "review";

export interface Permission {
  resource: ResourceType;
  action: PermissionAction;
  conditions?: {
    departmentId?: string[];
    jobId?: string[];
    ownOnly?: boolean;
    workflowSteps?: string[]; // Reference to WorkflowStep ids
    workflowActions?: WorkflowActionType[]; // Specific actions they can execute
    workflowTriggers?: WorkflowTrigger[]; // Specific triggers they can handle
  };
}
