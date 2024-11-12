import { JobOpening } from "@/@types/openings";

export const publishedJobs: JobOpening[] = [
  {
    id: 1,
    title: "Senior Frontend Developer",
    platform: "LinkedIn",
    views: 1234,
    applications: 45,
    status: "Active",
    publishedDate: new Date("2024-03-15"),
  },
  {
    id: 2,
    title: "Product Manager",
    platform: "Indeed",
    views: 890,
    applications: 23,
    status: "Active",
    publishedDate: new Date("2024-03-10"),
  },
];
