import { User, UserPermissions } from "@/@types/user";

const mockPermissions: UserPermissions = {
  canCreateJobs: true,
  canEditJobs: true,
  canDeleteJobs: true,
  canViewCandidates: true,
  canEditCandidates: true,
  canScheduleInterviews: true,
  canAccessReports: true,
};

export const mockUsers: User[] = [
  {
    id: "user-001",
    email: "john.doe@techcorp.com",
    firstName: "John",
    lastName: "Doe",
    role: "admin",
    permissions: mockPermissions,
    department: "Engineering",
    phoneNumber: "+1 (555) 123-4567",
    profileImage: "https://example.com/profiles/john-doe.jpg",
    lastLoginAt: "2024-03-15T10:30:00Z",
    isActive: true,
    isDeleted: false,
    createdAt: "2024-01-01T00:00:00Z",
    updatedAt: "2024-03-15T00:00:00Z",
  },
  {
    id: "user-002",
    email: "jane.smith@techcorp.com",
    firstName: "Jane",
    lastName: "Smith",
    role: "recruiter",
    permissions: {
      ...mockPermissions,
      canDeleteJobs: false,
    },
    department: "HR",
    phoneNumber: "+1 (555) 987-6543",
    profileImage: "https://example.com/profiles/jane-smith.jpg",
    lastLoginAt: "2024-03-15T09:15:00Z",
    isActive: true,
    isDeleted: false,
    createdAt: "2024-01-01T00:00:00Z",
    updatedAt: "2024-03-15T00:00:00Z",
  },
];
