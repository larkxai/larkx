import { ISODateString, Metadata } from "./common";

export type UserRole =
  | "admin"
  | "recruiter"
  | "hiring_manager"
  | "interviewer"
  | "candidate";

export interface UserPermissions {
  canCreateJobs: boolean;
  canEditJobs: boolean;
  canDeleteJobs: boolean;
  canViewCandidates: boolean;
  canEditCandidates: boolean;
  canScheduleInterviews: boolean;
  canAccessReports: boolean;
}

export interface User extends Metadata {
  email: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  permissions: UserPermissions;
  department?: string;
  phoneNumber?: string;
  profileImage?: string;
  lastLoginAt?: ISODateString;
}
