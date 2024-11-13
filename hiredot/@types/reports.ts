import { Metadata, ISODateString } from './common';

export type ReportType = 
  | 'hiring_metrics'
  | 'candidate_pipeline'
  | 'time_to_hire'
  | 'source_effectiveness'
  | 'diversity_metrics';

export interface ReportFilter {
  startDate?: ISODateString;
  endDate?: ISODateString;
  department?: string;
  jobRole?: string;
  location?: string;
}

export interface ReportMetric {
  name: string;
  value: number | string;
  change?: number;
  trend?: 'up' | 'down' | 'stable';
}

export interface Report extends Metadata {
  type: ReportType;
  name: string;
  description?: string;
  filters: ReportFilter;
  metrics: ReportMetric[];
  generatedAt: ISODateString;
  generatedBy: string;
  format: 'pdf' | 'csv' | 'excel';
  scheduledReport?: {
    frequency: 'daily' | 'weekly' | 'monthly';
    recipients: string[];
    lastSent?: ISODateString;
  };
}
