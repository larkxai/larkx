import { Report } from "@/@types/reports";

export const mockReports: Report[] = [
  {
    id: "report-001",
    type: "hiring_metrics", 
    name: "Monthly Hiring Report",
    description: "Key hiring metrics and trends",
    filters: {
      startDate: "2024-01-01",
      endDate: "2024-06-30",
    },
    metrics: [
      {
        name: "Total Applications",
        value: 550,
        change: 10,
        trend: "up",
      },
      {
        name: "Time to Hire",
        value: "25 days",
        change: -2,
        trend: "down",
      },
    ],
    generatedAt: "2024-03-15T00:00:00Z",
    generatedBy: "user-001",
    format: "pdf",
    isActive: true,
    isDeleted: false,
    createdAt: "2024-01-01T00:00:00Z",
    updatedAt: "2024-03-15T00:00:00Z",
  },
  {
    id: "report-002",
    type: "candidate_pipeline",
    name: "Pipeline Status Report",
    description: "Current candidate pipeline metrics",
    filters: {
      startDate: "2024-01-01",
      endDate: "2024-06-30",
      department: "Engineering"
    },
    metrics: [
      {
        name: "Candidates in Pipeline",
        value: 125,
        change: 15,
        trend: "up"
      },
      {
        name: "Interview Pass Rate",
        value: "65%",
        change: -5,
        trend: "down"
      }
    ],
    generatedAt: "2024-03-16T00:00:00Z",
    generatedBy: "user-002",
    format: "excel",
    isActive: true,
    isDeleted: false,
    createdAt: "2024-01-02T00:00:00Z",
    updatedAt: "2024-03-16T00:00:00Z"
  },
  {
    id: "report-003", 
    type: "time_to_hire",
    name: "Time to Hire Analysis",
    description: "Analysis of hiring process duration",
    filters: {
      startDate: "2024-01-01",
      endDate: "2024-06-30",
      jobRole: "Senior Frontend Developer"
    },
    metrics: [
      {
        name: "Average Time to Hire",
        value: "45 days",
        change: -10,
        trend: "down"
      },
      {
        name: "Time in Each Stage",
        value: "Screening: 5d, Interview: 15d, Offer: 7d",
      }
    ],
    generatedAt: "2024-03-17T00:00:00Z",
    generatedBy: "user-001",
    format: "csv",
    isActive: true,
    isDeleted: false,
    createdAt: "2024-01-03T00:00:00Z",
    updatedAt: "2024-03-17T00:00:00Z"
  },
  {
    id: "report-004",
    type: "source_effectiveness",
    name: "Recruitment Source Report",
    description: "Effectiveness of different recruitment channels",
    filters: {
      startDate: "2024-01-01",
      endDate: "2024-06-30"
    },
    metrics: [
      {
        name: "LinkedIn Hires",
        value: 25,
        change: 5,
        trend: "up"
      },
      {
        name: "Referral Quality Score",
        value: "8.5/10",
        change: 0.5,
        trend: "up"
      }
    ],
    generatedAt: "2024-03-18T00:00:00Z",
    generatedBy: "user-003",
    format: "pdf",
    isActive: true,
    isDeleted: false,
    createdAt: "2024-01-04T00:00:00Z",
    updatedAt: "2024-03-18T00:00:00Z"
  },
  {
    id: "report-005",
    type: "diversity_metrics",
    name: "Diversity & Inclusion Report",
    description: "Diversity metrics across hiring pipeline",
    filters: {
      startDate: "2024-01-01",
      endDate: "2024-06-30",
      department: "All"
    },
    metrics: [
      {
        name: "Gender Distribution",
        value: "45% F, 52% M, 3% NB",
        change: 2,
        trend: "up"
      },
      {
        name: "Interview Panel Diversity",
        value: "80%",
        change: 10,
        trend: "up"
      }
    ],
    generatedAt: "2024-03-19T00:00:00Z",
    generatedBy: "user-002",
    format: "pdf",
    scheduledReport: {
      frequency: "monthly",
      recipients: ["hr@example.com", "dei@example.com"],
      lastSent: "2024-03-01T00:00:00Z"
    },
    isActive: true,
    isDeleted: false,
    createdAt: "2024-01-05T00:00:00Z",
    updatedAt: "2024-03-19T00:00:00Z"
  }
];
