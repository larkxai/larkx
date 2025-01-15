import {
  Department,
  Organization,
  Team,
  TeamPermission,
} from "@/@types/organization";
import { Permission } from "@/@types/permissions";

export const mockDepartments: Department[] = [
  {
    id: "dept-001",
    name: "Engineering",
    headCount: 50,
    budget: 5000000,
  },
];

// Team-specific permissions
const frontendTeamPermissions: Permission[] = [
  {
    resource: "candidate",
    action: "read",
    conditions: {
      workflowSteps: ["technical_assessment", "team_interview"],
      departmentId: ["dept-001"],
    },
  },
  {
    resource: "interview",
    action: "schedule",
    conditions: {
      workflowSteps: ["technical_interview", "pair_programming"],
    },
  },
];

const backendTeamPermissions: Permission[] = [
  {
    resource: "candidate",
    action: "read",
    conditions: {
      workflowSteps: ["system_design", "coding_challenge"],
      departmentId: ["dept-001"],
    },
  },
  {
    resource: "interview",
    action: "schedule",
    conditions: {
      workflowSteps: ["technical_interview", "architecture_review"],
    },
  },
];

const productTeamPermissions: Permission[] = [
  {
    resource: "candidate",
    action: "read",
    conditions: {
      workflowSteps: ["product_exercise", "stakeholder_interview"],
      departmentId: ["dept-002"],
    },
  },
  {
    resource: "interview",
    action: "schedule",
    conditions: {
      workflowSteps: ["product_presentation", "case_study"],
    },
  },
];

export const mockTeams: Team[] = [
  {
    id: "team-001",
    name: "Frontend Development",
    description:
      "Core frontend development team responsible for user interfaces",
    departments: [mockDepartments[0]], // Engineering
    members: ["user-001", "user-002", "user-003"],
    leaderId: "user-001",
    parentTeamId: "team-000", // Engineering parent team
    isActive: true,
    isDeleted: false,
    createdAt: "2024-01-01T00:00:00Z",
    updatedAt: "2024-03-15T00:00:00Z",
  },
  {
    id: "team-002",
    name: "Backend Development",
    description:
      "Core backend development team responsible for APIs and services",
    departments: [mockDepartments[0]], // Engineering
    members: ["user-004", "user-005", "user-006"],
    leaderId: "user-004",
    parentTeamId: "team-000", // Engineering parent team
    isActive: true,
    isDeleted: false,
    createdAt: "2024-01-01T00:00:00Z",
    updatedAt: "2024-03-15T00:00:00Z",
  },
  {
    id: "team-003",
    name: "Product Management",
    description: "Product strategy and roadmap team",
    departments: [mockDepartments[1]], // Product
    members: ["user-007", "user-008"],
    leaderId: "user-007",
    isActive: true,
    isDeleted: false,
    createdAt: "2024-01-01T00:00:00Z",
    updatedAt: "2024-03-15T00:00:00Z",
  },
  {
    id: "team-004",
    name: "QA Engineering",
    description: "Quality assurance and testing team",
    departments: [mockDepartments[0]], // Engineering
    members: ["user-009", "user-010"],
    leaderId: "user-009",
    parentTeamId: "team-000", // Engineering parent team
    isActive: true,
    isDeleted: false,
    createdAt: "2024-02-01T00:00:00Z",
    updatedAt: "2024-03-15T00:00:00Z",
  },
];

// Team permissions mapping for the organization
export const mockTeamPermissions: TeamPermission[] = [
  {
    teamId: "team-001",
    permissions: frontendTeamPermissions,
  },
  {
    teamId: "team-002",
    permissions: backendTeamPermissions,
  },
  {
    teamId: "team-003",
    permissions: productTeamPermissions,
  },
  {
    teamId: "team-004",
    permissions: [
      {
        resource: "candidate",
        action: "read",
        conditions: {
          workflowSteps: ["qa_assessment", "automation_test"],
          departmentId: ["dept-001"],
        },
      },
    ],
  },
];

// Parent teams (departments)
export const mockParentTeams: Team[] = [
  {
    id: "team-000",
    name: "Engineering",
    description: "All engineering teams",
    departments: [mockDepartments[0]],
    members: ["user-001", "user-004", "user-009"], // Team leads
    leaderId: "user-011", // Engineering Director
    isActive: true,
    isDeleted: false,
    createdAt: "2024-01-01T00:00:00Z",
    updatedAt: "2024-03-15T00:00:00Z",
    logoUrl: "https://placehold.co/400x400?text=Engineering",
  },
];

export const mockOrganization: Organization = {
  id: "org-001",
  name: "TechCorp Solutions",
  description: "Leading software development and consulting firm",
  industry: "Technology",
  size: "medium",
  website: "https://techcorp-solutions.com",
  logoUrl: "https://placehold.co/400x400?text=TechCorp",
  locations: [
    {
      id: "loc-001",
      address: "123 Tech Street",
      city: "San Francisco",
      state: "CA",
      country: "USA",
      postalCode: "94105",
      isPrimary: true,
    },
  ],
  teams: mockParentTeams,
  linkedInUrl: "https://linkedin.com/company/techcorp-solutions",
  twitterHandle: "@techcorp",
  culture: ["Innovation", "Collaboration", "Excellence"],
  benefits: ["Health Insurance", "401k", "Remote Work"],
  currentPlan: {
    planId: "plan-002",
    name: "team",
    price: 499.99,
    billingCycle: "monthly",
    features: [
      {
        name: "Advanced Analytics",
        description: "Deep insights into team performance",
        isEnabled: true,
      },
    ],
    maxUsers: 50,
    maxStorage: 1000,
  },
  planHistory: [
    {
      plan: {
        planId: "plan-001",
        name: "pro",
        price: 299.99,
        billingCycle: "monthly",
        features: [
          {
            name: "Basic Analytics",
            description: "Team performance metrics",
            isEnabled: true,
          },
        ],
        maxUsers: 25,
        maxStorage: 500,
      },
      startDate: new Date("2023-01-01"),
      endDate: new Date("2023-12-31"),
    },
  ],
  permissions: {
    roles: [],
    teamPermissions: mockTeamPermissions,
    departmentPermissions: [],
  },
  orders: [
    {
      orderId: "order-001",
      createdAt: new Date("2024-01-15"),
      status: "completed",
      items: [
        {
          productId: "prod-001",
          quantity: 1,
          unitPrice: 499.99,
          total: 499.99,
        },
      ],
      subtotal: 499.99,
      tax: 45.0,
      total: 544.99,
      paymentMethod: "credit_card",
      paymentStatus: "paid",
    },
  ],
  billingAddress: {
    id: "loc-001",
    address: "123 Tech Street",
    city: "San Francisco",
    state: "CA",
    country: "USA",
    postalCode: "94105",
    isPrimary: false,
  },
  paymentMethods: [
    {
      id: "pm-001",
      type: "credit_card",
      lastFour: "4242",
      expiryDate: "12/25",
      isDefault: true,
    },
  ],
  isActive: true,
  isDeleted: false,
  createdAt: "2024-01-01T00:00:00Z",
  updatedAt: "2024-03-15T00:00:00Z",
};
