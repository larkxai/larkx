// enums
export type Platform = 'android' | 'ios';
export type SubmissionStatus =
  | 'created'
  | 'uploading'
  | 'processing'
  | 'in_review'
  | 'approved'
  | 'rejected'
  | 'failed';

export type AndroidTrack = 'internal' | 'closed' | 'production';
export type IOSDestination = 'testflight' | 'appstore_review';
export type Severity = 'info' | 'warning' | 'error';

// core models
export interface App {
  id: string; // app_*
  name: string;
  bundleId?: string | null; // iOS
  packageName?: string | null; // Android
  ownerUserId: string;
  notes?: string | null;
  createdAt: string; // ISO
  updatedAt: string; // ISO
}

export interface StoreCredentialsMask {
  appId: string;
  ios?: {
    issuerId: string;
    keyId: string;
    hasPrivateKey: boolean;
  } | null;
  android?: {
    hasServiceAccount: boolean;
  } | null;
  updatedAt: string;
}

export interface Binary {
  id: string; // bin_*
  appId: string;
  platform: Platform;
  versionName: string; // e.g., 1.0.3
  versionCode?: number | null; // android
  buildNumber?: number | null; // ios
  status: 'created' | 'ready' | 'invalid';
  parsed?: {
    packageName?: string | null;
    bundleId?: string | null;
    permissions?: string[];
  };
  uploadedAt?: string | null; // ISO
  createdAt?: string; // ISO
}

export interface LocaleFields {
  // Shared (enforce length limits at service layer)
  title?: string;
  subtitle?: string; // iOS
  shortDescription?: string; // Play short desc (<=80 chars)
  fullDescription?: string; // Play full desc (<=4000 chars)
  keywords?: string; // iOS comma-separated (<=100 chars)
  promotionalText?: string; // iOS (<=170)
}

export interface ContentAssets {
  icon?: {
    ios1024?: string; // s3://...
    play512?: string; // s3://...
  };
  featureGraphic?: string; // Play 1024x500
  screenshots?: {
    ios?: {
      // keys by required size label
      ['6.7']?: string[];
      ['5.5']?: string[];
      ['12.9']?: string[];
    };
    android?: {
      phone?: string[];
      tablet?: string[];
    };
  };
}

export interface DataSafety {
  collectsData: boolean;
  shared: boolean;
  purposes?: string[]; // optional detail
}

export interface ContentCompliance {
  privacyPolicyUrl: string;
  ageRating?: string; // normalized string (e.g., '4+', '9+', '12+')
  exportCompliance?: boolean;
  dataSafety?: DataSafety;
}

export interface ContentVersion {
  id: string; // cnt_*
  appId: string;
  semver: string; // e.g., 2025.09.11.1
  locales: Record<string, LocaleFields>; // e.g., 'en-US', 'fr-FR'
  assets: ContentAssets;
  compliance: ContentCompliance;
  notes?: string | null;
  createdAt: string; // ISO
}

export interface SubmissionEvent {
  ts: string; // ISO
  event: string; // e.g., 'created', 'upload_started', 'processing', 'in_review', 'rejected'
  meta?: Record<string, unknown>;
}

export interface Submission {
  id: string; // sub_*
  appId: string;
  platform: Platform;
  binaryId: string;
  contentVersionId: string;
  status: SubmissionStatus;
  storeBuildId?: string | null;
  storeLinks?: {
    appStoreConnectUrl?: string | null;
    googlePlayUrl?: string | null;
  };
  lastError?: ProblemDetail | null;
  history: SubmissionEvent[];
  createdAt?: string; // ISO
  updatedAt?: string; // ISO
}

// DTOs

export interface ProblemDetail {
  type?: string;
  title?: string;
  status?: number;
  detail?: string;
  instance?: string;
  errors?: Record<string, string[]>;
}

// Create App
export interface CreateAppRequest {
  name: string;
  bundleId?: string;
  packageName?: string;
  notes?: string;
}
export type CreateAppResponse = App;

// Credentials
export interface UpsertCredentialsRequest {
  ios?: {
    issuerId: string;
    keyId: string;
    p8: string; // PEM string
  };
  android?: {
    serviceAccountJson: Record<string, unknown>;
  };
}
export type UpsertCredentialsResponse = StoreCredentialsMask;
export type GetCredentialsMaskResponse = StoreCredentialsMask;

// Binaries
export interface InitiateBinaryUploadRequest {
  platform: Platform;
  versionName: string;
  versionCode?: number; // required if android
  buildNumber?: number; // required if ios
  bundleId?: string;
  packageName?: string;
}
export interface PresignedUpload {
  url: string;
  method: 'PUT';
  headers?: Record<string, string>;
}
export interface InitiateBinaryUploadResponse {
  binary: Binary;
  upload: PresignedUpload;
}
export type FinalizeBinaryResponse = Binary;
export interface ListBinariesResponse {
  items: Binary[];
  nextCursor?: string | null;
}
export type GetBinaryResponse = Binary;

// Content
export interface CreateContentVersionRequest {
  semver: string;
  locales: Record<string, LocaleFields>;
  assets: ContentAssets;
  compliance: ContentCompliance;
  notes?: string;
}
export type CreateContentVersionResponse = ContentVersion;
export interface ListContentVersionsResponse {
  items: ContentVersion[];
  nextCursor?: string | null;
}
export type GetContentVersionResponse = ContentVersion;

// Preflight
export interface PreflightRequest {
  binaryId: string;
  contentVersionId: string;
  platform: Platform;
}
export interface PreflightIssue {
  code: string;
  severity: Severity;
  message: string;
  path?: string; // dot-path to failing field
}
export interface PreflightResponse {
  pass: boolean;
  issues: PreflightIssue[];
}

// Submissions
export interface CreateSubmissionRequest {
  binaryId: string;
  contentVersionId: string;
  platform: Platform;
  android?: { track: AndroidTrack };
  ios?: { destination: IOSDestination };
}
export type CreateSubmissionResponse = Submission;

export interface ResubmitRequest {
  contentVersionId?: string;
  binaryId?: string;
}
export type ResubmitResponse = Submission;
export interface ListSubmissionsResponse {
  items: Submission[];
  nextCursor?: string | null;
}
export type GetSubmissionResponse = Submission;

// History
export interface HistoryEvent {
  ts: string;
  type: string;
  id: string;
  meta?: Record<string, unknown>;
}
export interface HistoryResponse {
  events: HistoryEvent[];
  nextCursor?: string | null;
}
