export type ISODateString = string;

export enum StageType {
  Form = "form",
  Feedback = "feedback",
  Offer = "offer",
  Interview = "interview",
  Rejection = "rejection",
}

export enum HistoryEntryType {
  StageChange = "stage_change",
  Note = "note",
  InterviewFeedback = "interview_feedback",
  DocumentAdded = "document_added",
  TagsUpdated = "tags_updated",
}

export enum EmploymentType {
  FullTime = "Full-time",
  PartTime = "Part-time",
  Contract = "Contract",
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

export type ID<T> = string & { __brand: T };

export type CandidateId = ID<"candidate">;
export type WorkflowId = ID<"workflow">;
export type JobId = ID<"job">;

// Usage example for other files:
export interface HistoryEntry {
  date: ISODateString; // Instead of Date
  // ...
}
