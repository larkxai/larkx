import { Workflow, WorkflowStep } from "../@types/workflow";

const mockSteps: WorkflowStep[] = [
  {
    id: "step1",
    name: "Initial Application Form",
    type: "form",
    conditions: [],
    form: {
      title: "Application Details",
      description: "Please fill out your basic information",
      questions: [
        {
          id: "name",
          type: "text",
          question: "What is your full name?",
          required: true,
          validation: {
            minLength: 2,
            maxLength: 100,
          },
        },
        {
          id: "experience",
          type: "select",
          question: "Years of experience",
          required: true,
          options: ["0-2", "3-5", "5-10", "10+"],
        },
      ],
      submitButtonText: "Submit Application",
    },
    nextSteps: ["step2"],
  },
  {
    id: "step2",
    name: "Technical Assessment",
    type: "quiz",
    conditions: [],
    quiz: {
      title: "JavaScript Knowledge Test",
      description: "Basic JavaScript concepts assessment",
      questions: [
        {
          id: "q1",
          type: "radio",
          question: "What is closure in JavaScript?",
          required: true,
          options: [
            "A function with its lexical environment",
            "A loop structure",
            "A data type",
            "A debugging tool",
          ],
        },
      ],
      passingScore: 70,
      timeLimit: 30,
    },
    nextSteps: ["step3"],
  },
  {
    id: "step3",
    name: "Interview Scheduling",
    type: "scheduler",
    conditions: [],
    scheduler: {
      title: "Technical Interview",
      description: "Choose your preferred time slot",
      availableSlots: [
        {
          startTime: "2024-03-20T10:00:00Z",
          endTime: "2024-03-20T11:00:00Z",
          interviewers: ["interviewer1", "interviewer2"],
        },
        {
          startTime: "2024-03-21T14:00:00Z",
          endTime: "2024-03-21T15:00:00Z",
          interviewers: ["interviewer3"],
        },
      ],
      duration: 60,
      maxOptions: 2,
    },
  },
];

export const mockWorkflows: Workflow[] = [
  {
    id: "workflow1",
    name: "Developer Hiring Pipeline",
    description: "Standard workflow for hiring software developers",
    trigger: "candidate_applied",
    enabled: true,
    steps: mockSteps,
    createdAt: "2024-03-15T08:00:00Z",
    updatedAt: "2024-03-15T08:00:00Z",
    isActive: true,
    isDeleted: false,
    metadata: {
      createdBy: "admin1",
      executionCount: 150,
      averageExecutionTime: 72, // hours
      lastExecuted: "2024-03-19T15:30:00Z",
    },
  },
  {
    id: "workflow2",
    name: "Interview Follow-up",
    description: "Automated follow-up actions after interviews",
    trigger: "interview_scheduled",
    enabled: true,
    steps: [
      {
        id: "followup1",
        name: "Send Thank You Email",
        type: "action",
        conditions: [],
        actions: [
          {
            type: "send_email",
            config: {
              to: "{{candidate.email}}",
              subject: "Thank you for interviewing with us",
              body: "Dear {{candidate.name}},\n\nThank you for taking the time to interview with us...",
            },
            delay: 3600, // 1 hour delay
          },
        ],
      },
    ],
    createdAt: "2024-03-10T10:00:00Z",
    updatedAt: "2024-03-10T10:00:00Z",
    isActive: true,
    isDeleted: false,
    metadata: {
      createdBy: "admin2",
      executionCount: 75,
      averageExecutionTime: 2,
    },
  },
];

export default mockWorkflows;
