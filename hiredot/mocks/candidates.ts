import { InterviewStage, WorkflowStage } from "@/@types/workflow";
import { mockJobs } from "./roles";
import { Candidate } from "@/@types/candidates";

const applicationForm: WorkflowStage = {
  id: "1",
  title: "Application Form",
  type: "form",
  questions: [],
  triggers: [],
};

const newStage: WorkflowStage = {
  id: "5",
  title: "New",
  type: "rejection",
  message: "",
  triggers: [],
};

const offer: WorkflowStage = {
  id: "6",
  title: "Offer",
  type: "offer",
  message: "",
  triggers: [],
};

const interview: InterviewStage = {
  id: "7",
  title: "Interview",
  type: "interview",
  message: "",
  timeSlots: [],
  callLink: "",
  triggers: [],
};

export const mockCandidates: Candidate[] = [
  {
    id: "1",
    firstName: "John",
    lastName: "Doe",
    email: "john.doe@email.com",
    phone: "+1 (555) 123-4567",
    source: "LinkedIn",
    currentStage: applicationForm,
    createdAt: new Date("2024-03-01"),
    updatedAt: new Date("2024-03-15"),
    tags: ["React", "TypeScript", "Senior", "Available Immediately"],
    job: mockJobs[0],
    history: [
      {
        id: "hist-1",
        date: new Date("2024-03-01"),
        type: "stage_change",
        title: "Application Received",
        description: "Candidate applied through LinkedIn",
        author: "System",
      },
      {
        id: "hist-2",
        date: new Date("2024-03-10"),
        type: "note",
        title: "Initial Review",
        description: "Strong technical background, good culture fit potential",
        author: "Sarah Miller",
      },
      {
        id: "hist-3",
        date: new Date("2024-03-15"),
        type: "stage_change",
        title: "Moved to Screening",
        description: "Scheduled initial screening call for next week",
        author: "James Wilson",
      },
    ],
    resume: "john-doe-resume.pdf",
  },
  {
    id: "2",
    firstName: "Jane",
    lastName: "Smith",
    email: "jane.smith@email.com",
    phone: "+1 (555) 765-4321",
    source: "Referral",
    currentStage: {
      id: "3",
      title: "Technical Test",
      type: "interview",
      message: "",
      timeSlots: [],
      callLink: "",
      triggers: [],
    },
    createdAt: new Date("2024-02-28"),
    updatedAt: new Date("2024-03-14"),
    tags: ["Python", "Machine Learning", "Mid-level", "Available Immediately"],
    job: mockJobs[1],
    history: [
      {
        id: "hist-4",
        date: new Date("2024-02-28"),
        type: "stage_change",
        title: "Application Received",
        description: "Candidate referred by a current employee",
        author: "System",
      },
      {
        id: "hist-5",
        date: new Date("2024-03-05"),
        type: "note",
        title: "Initial Review",
        description: "Strong technical background, good fit for the role",
        author: "Michael Johnson",
      },
      {
        id: "hist-6",
        date: new Date("2024-03-14"),
        type: "stage_change",
        title: "Moved to Technical Test",
        description: "Scheduled technical test for next week",
        author: "James Wilson",
      },
    ],
    resume: "jane-smith-resume.pdf",
  },
  {
    id: "3",
    firstName: "Michael",
    lastName: "Johnson",
    email: "michael.johnson@email.com",
    phone: "+1 (555) 901-2345",
    source: "Indeed",
    currentStage: interview,
    createdAt: new Date("2024-03-10"),
    updatedAt: new Date("2024-03-16"),
    tags: ["Full-stack", "Node.js", "Senior", "Available Immediately"],
    job: mockJobs[2],
    history: [
      {
        id: "hist-7",
        date: new Date("2024-03-10"),
        type: "stage_change",
        title: "Application Received",
        description: "Candidate applied through Indeed",
        author: "System",
      },
      {
        id: "hist-8",
        date: new Date("2024-03-12"),
        type: "note",
        title: "Initial Review",
        description: "Strong technical background, good fit for the role",
        author: "Sarah Miller",
      },
      {
        id: "hist-9",
        date: new Date("2024-03-16"),
        type: "stage_change",
        title: "Moved to Interview",
        description: "Scheduled initial interview for next week",
        author: "James Wilson",
      },
    ],
    resume: "michael-johnson-resume.pdf",
  },
  {
    id: "4",
    firstName: "Sarah",
    lastName: "Williams",
    email: "sarah.williams@email.com",
    phone: "+1 (555) 567-8901",
    source: "Direct Application",
    currentStage: newStage,
    createdAt: new Date("2024-03-16"),
    updatedAt: new Date("2024-03-16"),
    tags: ["Frontend", "Vue.js", "Junior", "Available Immediately"],
    job: mockJobs[0],
    history: [
      {
        id: "hist-10",
        date: new Date("2024-03-16"),
        type: "stage_change",
        title: "Application Received",
        description: "Candidate applied directly",
        author: "System",
      },
      {
        id: "hist-11",
        date: new Date("2024-03-16"),
        type: "note",
        title: "Initial Review",
        description: "Strong technical background, good fit for the role",
        author: "Sarah Miller",
      },
      {
        id: "hist-12",
        date: new Date("2024-03-16"),
        type: "stage_change",
        title: "Moved to New",
        description: "Candidate is now in the new stage",
        author: "James Wilson",
      },
    ],
    resume: "sarah-williams-resume.pdf",
  },
  {
    id: "5",
    firstName: "David",
    lastName: "Brown",
    email: "david.brown@email.com",
    phone: "+1 (555) 345-6789",
    source: "LinkedIn",
    currentStage: offer,
    createdAt: new Date("2024-02-15"),
    updatedAt: new Date("2024-03-14"),
    tags: ["Backend", "Java", "Senior", "Available Immediately"],
    job: mockJobs[0],
    history: [
      {
        id: "hist-13",
        date: new Date("2024-02-15"),
        type: "stage_change",
        title: "Application Received",
        description: "Candidate applied through LinkedIn",
        author: "System",
      },
      {
        id: "hist-14",
        date: new Date("2024-02-20"),
        type: "note",
        title: "Initial Review",
        description: "Strong technical background, good fit for the role",
        author: "Sarah Miller",
      },
      {
        id: "hist-15",
        date: new Date("2024-03-14"),
        type: "stage_change",
        title: "Moved to Offer",
        description: "Candidate is now in the offer stage",
        author: "James Wilson",
      },
    ],
    resume: "david-brown-resume.pdf",
  },
];
