import { WorkflowStage } from "@/@types/workflow";

export const workflowMocks: WorkflowStage[] = [
  {
    id: "1",
    type: "form",
    title: "Application Form",
    triggers: [
      {
        id: "t1",
        rule: "FORM_COMPLETE",
        description: "Move to evaluation when form is complete",
        sourceStageId: "1",
        targetStageId: "2",
        stageType: "feedback",
        action: "Submit Application",
      },
    ],
    questions: [
      {
        id: "q1",
        type: "text",
        question: "What interests you about this position?",
        required: true,
      },
      {
        id: "q2",
        type: "checkbox",
        question: "Select your areas of expertise",
        required: true,
        options: [
          "Frontend",
          "Backend",
          "DevOps",
          "UI/UX",
          "Project Management",
        ],
      },
      {
        id: "q3",
        type: "multipleChoice",
        question: "Years of experience",
        required: true,
        options: ["0-2", "3-5", "5-8", "8+"],
      },
    ],
  },
  {
    id: "2",
    type: "feedback",
    title: "Initial Evaluation",
    triggers: [
      {
        id: "t2",
        rule: "SCORE>7",
        description: "Move to interview if score is greater than 7",
        sourceStageId: "2",
        targetStageId: "3",
        stageType: "interview",
        action: "Schedule Interview",
      },
      {
        id: "t3",
        rule: "SCORE<4",
        description: "Move to rejection if score is less than 4",
        sourceStageId: "2",
        targetStageId: "5",
        stageType: "rejection",
        action: "Reject Application",
      },
    ],
    message:
      "Thank you for your application. We are currently reviewing your submission and will get back to you shortly.",
  },
  {
    id: "3",
    type: "interview",
    title: "Technical Interview",
    triggers: [
      {
        id: "t4",
        rule: "INTERVIEW_PASS",
        description: "Move to offer if interview is passed",
        sourceStageId: "3",
        targetStageId: "4",
        stageType: "offer",
        action: "Send Offer",
      },
      {
        id: "t5",
        rule: "INTERVIEW_FAIL",
        description: "Move to rejection if interview is failed",
        sourceStageId: "3",
        targetStageId: "5",
        stageType: "rejection",
        action: "Reject Candidate",
      },
    ],
    message:
      "Congratulations! We would like to invite you for a technical interview. Please select a suitable time slot below.",
    timeSlots: [
      {
        id: "ts1",
        startTime: "2024-03-20T10:00:00Z",
        endTime: "2024-03-20T11:00:00Z",
        available: true,
      },
      {
        id: "ts2",
        startTime: "2024-03-20T14:00:00Z",
        endTime: "2024-03-20T15:00:00Z",
        available: true,
      },
      {
        id: "ts3",
        startTime: "2024-03-21T11:00:00Z",
        endTime: "2024-03-21T12:00:00Z",
        available: true,
      },
    ],
    callLink: "https://meet.google.com/example-link",
  },
  {
    id: "4",
    type: "offer",
    title: "Job Offer",
    triggers: [],
    message:
      "Congratulations! We are pleased to offer you the position. Please review the attached offer letter and let us know if you have any questions.",
  },
  {
    id: "5",
    type: "rejection",
    title: "Application Status",
    triggers: [],
    message:
      "Thank you for your interest in our company. While we were impressed with your qualifications, we have decided to move forward with other candidates who better match our current needs.",
  },
];
