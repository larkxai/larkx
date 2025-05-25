import { Candidate } from "@/@types/candidates";

export const mockCandidates: Candidate[] = [
  {
    id: "1",
    firstName: "John",
    lastName: "Doe",
    email: "john.doe@email.com",
    phoneNumber: "+1 (555) 123-4567",
    location: "San Francisco, CA",
    currentRole: "Senior Frontend Developer",
    status: "screening",
    jobId: "job-001",
    jobListingId: "jl-001",
    completedAgents: ["agent1"],
    currentStage: "form_submitted",
    formData: {
      agent1: {
        timestamp: "2024-03-01T00:00:00Z",
        value: "John Doe",
      },
    },
    isActive: true,
    isDeleted: false,
    createdAt: "2024-03-01T00:00:00Z",
    updatedAt: "2024-03-15T00:00:00Z",
  },
];
