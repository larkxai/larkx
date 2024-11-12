import { Job } from "@/@types/job";

export const mockJobs: Job[] = [
  {
    id: "1",
    title: "Senior Frontend Developer",
    department: "Engineering",
    location: "Remote",
    type: "Full-time",
    description: "We are looking for an experienced Frontend Developer...",
    createdAt: new Date("2024-03-15"),
  },
  {
    id: "2",
    title: "Product Manager",
    department: "Product",
    location: "Remote",
    type: "Full-time",
    description:
      "Seeking a Product Manager to lead our core product initiatives...",
    createdAt: new Date("2024-03-14"),
  },
  {
    id: "3",
    title: "DevOps Engineer",
    department: "Engineering",
    location: "Remote",
    type: "Full-time",
    description: "Join our infrastructure team as a DevOps Engineer...",
    createdAt: new Date("2024-03-13"),
  },
];
