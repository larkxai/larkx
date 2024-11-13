import { JobRole } from "./jobRole";
import { Workflow } from "./workflow";

export interface JobRequisition {
  id: string;
  title: string;
  role: JobRole;
  department: string;
  location: string;
  description: string;
  type: "Full-time" | "Part-time" | "Contract";
  workflow?: Workflow;
  createdAt: Date;
  applicants?: number;
  requirements?: string[];
}
