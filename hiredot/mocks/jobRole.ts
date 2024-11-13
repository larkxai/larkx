import { JobRole, CompetencyLevel } from "@/@types/jobRole";

const mockCompetencyLevels: CompetencyLevel[] = [
  {
    name: "Junior Developer",
    description: "Entry-level software developer position",
    requiredSkills: ["JavaScript", "HTML", "CSS", "Git"],
    yearsOfExperience: 1,
  },
  {
    name: "Mid-level Developer",
    description: "Intermediate software developer position",
    requiredSkills: ["React", "TypeScript", "Node.js", "AWS"],
    yearsOfExperience: 3,
  },
  {
    name: "Senior Developer",
    description: "Senior software developer position",
    requiredSkills: [
      "System Design",
      "Architecture",
      "Team Leadership",
      "DevOps",
    ],
    yearsOfExperience: 5,
  },
];

export const mockJobRoles: JobRole[] = [
  {
    id: "role-001",
    title: "Frontend Developer",
    description:
      "Responsible for building user interfaces and web applications",
    department: "Engineering",
    level: "mid-level",
    competencies: mockCompetencyLevels,
    careerPath: [
      "Junior Developer",
      "Mid-level Developer",
      "Senior Developer",
      "Lead Developer",
    ],
    responsibilities: [
      "Develop new user-facing features",
      "Build reusable components",
      "Optimize applications for performance",
    ],
    requiredQualifications: [
      "Bachelor's degree in Computer Science or related field",
      "3+ years of frontend development experience",
      "Strong JavaScript and React skills",
    ],
    preferredQualifications: [
      "Experience with Next.js",
      "Knowledge of GraphQL",
      "Experience with mobile-first design",
    ],
    isActive: true,
    isDeleted: false,
    createdAt: "2024-01-01T00:00:00Z",
    updatedAt: "2024-03-15T00:00:00Z",
  },
];
