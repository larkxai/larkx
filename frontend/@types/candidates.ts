import { Metadata, ID, ISODateString } from "./common";

export type CandidateStatus =
  | "new"
  | "screening"
  | "interviewing"
  | "offered"
  | "hired"
  | "rejected"
  | "withdrawn";

export interface Candidate extends Metadata {
  id: ID;
  firstName: string;
  lastName: string;
  email: string;
  phoneNumber?: string;
  location?: string;
  currentRole?: string;
  status: CandidateStatus;
  jobId: ID;
  jobListingId: ID;
  completedAgents: string[];
  currentStage: string;
  formData: {
    [agentId: string]: {
      timestamp: ISODateString;
      values: { [fieldName: string]: string[] };
      chatHistory: Array<{ role: string; content: string }>;
    };
  };
  isActive: boolean;
  isDeleted: boolean;
  createdAt: ISODateString;
  updatedAt: ISODateString;
}
