/**
 * Represents an ISO 8601 formatted date string (e.g. "2023-12-31T23:59:59.999Z")
 */
export type ISODateString = string;

/**
 * Types of stages in a recruitment workflow
 */
export enum StageType {
  Form = "form",
  Feedback = "feedback", 
  Offer = "offer",
  Interview = "interview",
  Rejection = "rejection",
}

/**
 * Types of history entries that can be logged
 */
export enum HistoryEntryType {
  StageChange = "stage_change",
  Note = "note", 
  InterviewFeedback = "interview_feedback",
  DocumentAdded = "document_added",
  TagsUpdated = "tags_updated",
}

/**
 * Types of employment arrangements
 */
export enum EmploymentType {
  FullTime = "Full-time",
  PartTime = "Part-time", 
  Contract = "Contract",
  Internship = "Internship",
  Temporary = "Temporary",
}

/**
 * Generic interface for paginated API responses
 */
export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
  totalPages?: number;
}

/**
 * Type-safe ID generator to prevent mixing different types of IDs
 */
export type ID<T extends string> = string & { readonly __brand: T };

// Common ID types used throughout the application
export type CandidateId = ID<"candidate">;
export type WorkflowId = ID<"workflow">;
export type JobId = ID<"job">;
export type CompanyId = ID<"company">;
export type LocationId = ID<"location">;
export type DepartmentId = ID<"department">;

/**
 * Base interface for entities that need timestamps
 */
export interface TimeStampedEntity {
  createdAt: ISODateString;
  updatedAt: ISODateString;
}

/**
 * Base interface for entities that need soft deletion
 */
export interface SoftDeletableEntity {
  deletedAt?: ISODateString;
  isDeleted: boolean;
}
