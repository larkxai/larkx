/**
 * Represents an ISO 8601 formatted date string (e.g. "2023-12-31T23:59:59.999Z")
 */
export type ISODateString = string;

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
export type CompanyId = Brand<string, "CompanyId">;
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

export interface PaginationParams {
  page: number;
  limit: number;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
}
