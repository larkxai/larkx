import { ID } from "./common";
import { Company } from "./company";

export type UserId = ID<"user">;
export type RoleId = ID<"role">;

export enum UserStatus {
  Active = "active",
  Inactive = "inactive",
  Pending = "pending",
  Suspended = "suspended",
}

export enum Permission {
  // Company management
  ManageCompanySettings = "manage_company_settings",
  ViewCompanySettings = "view_company_settings",

  // User management
  ManageUsers = "manage_users",
  ViewUsers = "view_users",

  // Role management
  ManageRoles = "manage_roles",
  ViewRoles = "view_roles",

  // Candidate management
  ManageCandidates = "manage_candidates",
  ViewCandidates = "view_candidates",

  // Job management
  ManageJobs = "manage_jobs",
  ViewJobs = "view_jobs",
  CreateJobs = "create_jobs",

  // Workflow management
  ManageWorkflows = "manage_workflows",
  ViewWorkflows = "view_workflows",

  // Interview management
  ScheduleInterviews = "schedule_interviews",
  ConductInterviews = "conduct_interviews",

  // Reports
  ViewReports = "view_reports",
  ExportReports = "export_reports",
}

export interface Role {
  id: RoleId;
  name: string;
  description?: string;
  permissions: Permission[];
  isDefault?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface User {
  id: UserId;
  email: string;
  firstName: string;
  lastName: string;
  status: UserStatus;
  role: Role;
  company: Company;
  department?: string;
  position?: string;
  phoneNumber?: string;
  lastLoginAt?: string;
  createdAt: string;
  updatedAt: string;
  preferences: UserPreferences;
  notifications: NotificationSettings;
}

export interface UserPreferences {
  theme: "light" | "dark" | "system";
  language: string;
  timezone: string;
  emailNotifications: boolean;
  pushNotifications: boolean;
}

export interface NotificationSettings {
  newCandidateAlert: boolean;
  interviewReminders: boolean;
  candidateStatusUpdates: boolean;
  workflowUpdates: boolean;
  teamMemberMentions: boolean;
  dailyDigest: boolean;
  weeklyReport: boolean;
}

export interface Session {
  user: User;
  expiresAt: string;
  lastActivity: string;
  deviceInfo: {
    browser: string;
    os: string;
    ip: string;
    location?: string;
  };
}

export interface UserInvitation {
  id: string;
  email: string;
  role: Role;
  invitedBy: User;
  company: Company;
  status: "pending" | "accepted" | "expired";
  expiresAt: string;
  createdAt: string;
}

export interface AuditLogEntry {
  id: string;
  userId: UserId;
  action: string;
  entityType: "user" | "candidate" | "job" | "workflow" | "company" | "role";
  entityId: string;
  changes: {
    field: string;
    oldValue: string | number | boolean | null | undefined;
    newValue: string | number | boolean | null | undefined;
  }[];
  metadata: Record<string, string | number | boolean | null | undefined>;
  timestamp: string;
  ipAddress: string;
}
