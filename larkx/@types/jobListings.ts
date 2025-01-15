import { Metadata, ID, ISODateString } from "./common";
import { JobRole } from "./jobRole";

export type JobType = "full_time" | "part_time" | "contract" | "internship";
export type RemotePolicy = "remote" | "hybrid" | "on_site";
export type ExperienceLevel = "entry" | "mid" | "senior" | "lead" | "executive";

export type ListingStatus =
  | "draft"
  | "active"
  | "paused"
  | "closed"
  | "archived";

export interface SalaryRange {
  min: number;
  max: number;
  currency: string;
}

export interface Platform {
  id: ID;
  name: string;
}

export interface JobListing extends Metadata {
  title: string;
  roleId: ID;
  role: JobRole;
  department: string;
  description: string;
  requirements: string[];
  responsibilities: string[];
  qualifications: string[];
  jobType: JobType;
  remotePolicy: RemotePolicy;
  experienceLevel: ExperienceLevel;
  location: string;
  salary: SalaryRange;
  benefits?: string[];
  skills: string[];
  isUrgent: boolean;
  applicationDeadline?: ISODateString;
  numberOfOpenings: number;
  status: ListingStatus;
  platform: Platform;
  views?: number;
  applications?: number;
  publishedDate?: ISODateString;
}
