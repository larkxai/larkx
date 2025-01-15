import { JobListing, SalaryRange, Platform } from "@/@types/jobListings";
import { mockJobRoles } from "./jobRole";

const mockSalaryRanges: SalaryRange[] = [
  {
    min: 80000,
    max: 120000,
    currency: "USD",
  },
  {
    min: 120000,
    max: 180000,
    currency: "USD",
  },
];

const mockPlatforms: Platform[] = [
  {
    id: "platform-001",
    name: "LinkedIn",
  },
];

export const mockJobListings: JobListing[] = [
  {
    id: "job-001",
    title: "Senior Frontend Developer",
    roleId: "role-001",
    role: mockJobRoles[0],
    department: "Engineering",
    description:
      "We are seeking an experienced Frontend Developer to join our team...",
    status: "active",
    requirements: [
      "5+ years of experience with React",
      "Strong TypeScript skills",
      "Experience with state management",
    ],
    responsibilities: [
      "Lead frontend development initiatives",
      "Mentor junior developers",
      "Architect scalable solutions",
    ],
    qualifications: [
      "Bachelor's degree in Computer Science",
      "Strong problem-solving skills",
      "Excellent communication abilities",
    ],
    jobType: "full_time",
    remotePolicy: "hybrid",
    experienceLevel: "senior",
    location: "San Francisco, CA",
    salary: mockSalaryRanges[1],
    benefits: ["Health insurance", "401(k) matching", "Remote work stipend"],
    skills: ["React", "TypeScript", "Next.js", "GraphQL"],
    isUrgent: true,
    applicationDeadline: "2024-04-15T23:59:59Z",
    numberOfOpenings: 2,
    platform: mockPlatforms[0],
    views: 150,
    applications: 12,
    publishedDate: "2024-03-01T00:00:00Z",
    isActive: true,
    isDeleted: false,
    createdAt: "2024-03-01T00:00:00Z",
    updatedAt: "2024-03-15T00:00:00Z",
  },
];
