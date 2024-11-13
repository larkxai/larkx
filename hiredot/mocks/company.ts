import { Company, CompanyLocation, CompanyDepartment } from "@/@types/company";

export const mockLocations: CompanyLocation[] = [
  {
    address: "123 Main Street",
    city: "San Francisco",
    state: "CA",
    country: "USA",
    postalCode: "94105",
    isPrimary: true,
  },
  {
    address: "456 Market Street",
    city: "New York",
    state: "NY",
    country: "USA",
    postalCode: "10001",
    isPrimary: false,
  }
];

export const mockDepartments: CompanyDepartment[] = [
  {
    name: "Engineering",
    headCount: 50,
    budget: 5000000,
  },
  {
    name: "Product",
    headCount: 20,
    budget: 2000000,
  },
  {
    name: "Sales",
    headCount: 30,
    budget: 3000000,
  }
];

export const mockCompany: Company = {
  id: "comp-001",
  name: "TechCorp Solutions",
  description: "Leading provider of innovative software solutions",
  industry: "Technology",
  size: "medium",
  website: "https://techcorp.com",
  logoUrl: "https://techcorp.com/logo.png",
  locations: mockLocations,
  departments: mockDepartments,
  linkedInUrl: "https://linkedin.com/company/techcorp",
  twitterHandle: "@techcorp",
  culture: [
    "Innovation-driven",
    "Remote-first",
    "Work-life balance",
    "Continuous learning"
  ],
  benefits: [
    "Health insurance",
    "401(k) matching",
    "Unlimited PTO",
    "Remote work stipend"
  ],
  isActive: true,
  isDeleted: false,
  createdAt: "2024-01-01T00:00:00Z",
  updatedAt: "2024-03-15T00:00:00Z"
};
