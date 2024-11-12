export interface PublishingData {
  month: string;
  corporateWebsite: number;
  indeed: number;
  totalApplications: number;
}

export interface ApplicationSourceData {
  source: string;
  applications: number;
  percentage: string;
}

export interface TopPerformingJob {
  title: string;
  applications: number;
  views: number;
  conversionRate: string;
}
