import { Organization } from "@/@types/organization";

export const mockOrganization: Organization = {
  id: "org-001",
  name: "TechCorp Solutions",
  description: "Leading software development and consulting firm",
  industry: "Technology",
  website: "https://techcorp-solutions.com",
  teams: [
    {
      name: "Engineering",
      members: ["user-001", "user-004", "user-009"],
    },
  ],
  isActive: true,
  isDeleted: false,
  createdAt: "2024-01-01T00:00:00Z",
  updatedAt: "2024-03-15T00:00:00Z",
};
