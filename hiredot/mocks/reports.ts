import { PublishingData, ApplicationSourceData, TopPerformingJob } from "@/@types/reports";

export const publishingData: PublishingData[] = [
  { month: "Jan", corporateWebsite: 15, indeed: 10, totalApplications: 300 },
  { month: "Feb", corporateWebsite: 18, indeed: 12, totalApplications: 350 },
  { month: "Mar", corporateWebsite: 20, indeed: 15, totalApplications: 400 },
  { month: "Apr", corporateWebsite: 22, indeed: 18, totalApplications: 450 },
  { month: "May", corporateWebsite: 25, indeed: 20, totalApplications: 500 },
  { month: "Jun", corporateWebsite: 28, indeed: 22, totalApplications: 550 },
];

export const applicationSourceData: ApplicationSourceData[] = [
  { source: "Corporate Website", applications: 2000, percentage: "60%" },
  { source: "Indeed", applications: 1300, percentage: "39%" },
  { source: "Other", applications: 50, percentage: "1%" },
];

export const topPerformingJobs: TopPerformingJob[] = [
  {
    title: "Software Engineer",
    applications: 250,
    views: 1500,
    conversionRate: "16.7%",
  },
  {
    title: "Product Manager",
    applications: 180,
    views: 1200,
    conversionRate: "15.0%",
  },
  {
    title: "Data Analyst",
    applications: 150,
    views: 1000,
    conversionRate: "15.0%",
  },
  {
    title: "UX Designer",
    applications: 120,
    views: 900,
    conversionRate: "13.3%",
  },
  {
    title: "Sales Representative",
    applications: 100,
    views: 800,
    conversionRate: "12.5%",
  },
];
