import { User } from "@/@types/user";

export const mockUsers: User[] = [
  {
    id: "user-001",
    email: "john.doe@techcorp.com",
    name: "John Doe",
    role: "admin",
    lastLoginAt: "2024-03-15T10:30:00Z",
    isActive: true,
    isDeleted: false,
    createdAt: "2024-01-01T00:00:00Z",
    updatedAt: "2024-03-15T00:00:00Z",
  },
  {
    id: "user-002",
    email: "jane.smith@techcorp.com",
    name: "Jane Smith",
    role: "user",
    lastLoginAt: "2024-03-15T09:15:00Z",
    isActive: true,
    isDeleted: false,
    createdAt: "2024-01-01T00:00:00Z",
    updatedAt: "2024-03-15T00:00:00Z",
  },
];
