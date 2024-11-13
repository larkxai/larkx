import { Metadata, ISODateString } from "./common";
import { JobRole } from "./jobRole";

export type CandidateStatus =
  | "new"
  | "screening"
  | "interviewing"
  | "offered"
  | "hired"
  | "rejected"
  | "withdrawn";

export interface CandidateSkill {
  name: string;
  yearsOfExperience: number;
  level: "beginner" | "intermediate" | "expert";
}

export interface CandidateEducation {
  institution: string;
  degree: string;
  field: string;
  startDate: ISODateString;
  endDate?: ISODateString;
  gpa?: number;
}

export interface CandidateExperience {
  company: string;
  title: string;
  location: string;
  startDate: ISODateString;
  endDate?: ISODateString;
  description: string;
  highlights: string[];
}

export interface Candidate extends Metadata {
  firstName: string;
  lastName: string;
  email: string;
  phoneNumber?: string;
  location?: string;
  currentRole?: string;
  desiredRole?: JobRole;
  expectedSalary?: number;
  resumeUrl?: string;
  portfolioUrl?: string;
  linkedInUrl?: string;
  githubUrl?: string;
  status: CandidateStatus;
  skills: CandidateSkill[];
  education: CandidateEducation[];
  experience: CandidateExperience[];
  notes?: string;
  tags?: string[];
}
