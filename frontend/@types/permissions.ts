export type ResourceType = "report" | "user" | "department";

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
    ownOnly?: boolean;
  };
}
