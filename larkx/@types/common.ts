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

// Create a type factory for type-safe IDs
declare const brand: unique symbol;
type Brand<K, T> = K & { readonly [brand]: T };

// Common ID types used throughout the application
export type CandidateId = Brand<string, "CandidateId">;
export type WorkflowId = Brand<string, "WorkflowId">;
export type JobId = Brand<string, "JobId">;
export type CompanyId = Brand<string, "CompanyId">;
export type LocationId = Brand<string, "LocationId">;
export type DepartmentId = Brand<string, "DepartmentId">;

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

// Common types used across the application
export type ID = string;
export type UUID = string;

export interface Timestamp {
  createdAt: ISODateString;
  updatedAt: ISODateString;
}

export interface Metadata extends Timestamp {
  id: UUID;
  isActive: boolean;
  isDeleted: boolean;
}

export type Status = "active" | "inactive" | "pending" | "archived";

export interface PaginationParams {
  page: number;
  limit: number;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
}
