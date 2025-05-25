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
  };
}
