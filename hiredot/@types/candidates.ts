import { ISODateString } from "./common";
import { JobListing } from "./jobListings";
import { WorkflowStage } from "./workflow";

export type CandidateSource =
  | "LinkedIn"
  | "Indeed"
  | "Referral"
  | "Direct Application"
  | "Other";

export interface StageData {
  applicationForm?: {
    submissionDate: Date;
    completedFields: string[];
    attachments: string[];
  };
  initialEvaluation?: {
    evaluator: string;
    skillAssessment: Record<string, number>;
    notes: string;
  };
  interview?: {
    interviewer: string;
    scheduledDate: Date;
    feedback: string;
    technicalScore?: number;
    culturalScore?: number;
  };
  offer?: {
    salary: number;
    startDate: Date;
    benefits: string[];
    status: "Pending" | "Accepted" | "Declined";
  };
  [key: string]: any;
}

export interface HistoryEntry {
  id: string;
  date: Date;
  type:
    | "stage_change"
    | "note"
    | "interview_feedback"
    | "document_added"
    | "tags_updated";
  title: string;
  description: string;
  author: string;
  stageData?: StageData;
  previousTags?: string[];
  newTags?: string[];
}

export interface Candidate {
  readonly id: string;
  readonly createdAt: ISODateString;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  source: CandidateSource;
  currentStage: WorkflowStage;
  updatedAt: Date;
  tags: string[];
  listing?: JobListing;
  history: HistoryEntry[];
  resumeFile?: string;
  coverLetterFile?: string;
  notes: Note[];
  status: "active" | "archived" | "hired" | "rejected";
  lastActivityDate: ISODateString;
}

export interface Note {
  id: string;
  date: Date;
  content: string;
}

export interface Attachment {
  id: string;
  date: Date;
  file: string;
}
