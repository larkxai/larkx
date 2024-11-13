export enum JobListingStatus {
  Active = "Active",
  Paused = "Paused",
  Closed = "Closed",
  Draft = "Draft",
}

export interface JobListingPlatform {
  platform: string;
  url?: string;
}

export interface JobListing {
  id: number;
  title: string;
  platforms: JobListingPlatform[];
  views: number;
  applications: number;
  status: JobListingStatus;
  publishedDate: Date;
}
