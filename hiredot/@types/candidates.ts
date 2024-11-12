import { Job } from "./job";
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
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  source: CandidateSource;
  currentStage: WorkflowStage;
  createdAt: Date;
  updatedAt: Date;
  tags: string[];
  job: Job;
  history: HistoryEntry[];
  resume?: string;
  coverLetter?: string;
}
