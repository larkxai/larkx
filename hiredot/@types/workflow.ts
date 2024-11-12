export type QuestionType = "text" | "checkbox" | "multipleChoice";

export interface Trigger {
  id: string;
  rule: string;
  description: string;
  sourceStageId: string;
  targetStageId: string;
  stageType: "form" | "feedback" | "offer" | "interview" | "rejection";
  action: string;
}

export interface FormQuestion {
  id: string;
  type: QuestionType;
  question: string;
  required: boolean;
  options?: string[]; // For checkbox and multipleChoice questions
}

export interface TimeSlot {
  id: string;
  startTime: string;
  endTime: string;
  available: boolean;
}

export interface WorkflowStageBase {
  id: string;
  title: string;
  type: "form" | "feedback" | "offer" | "interview" | "rejection";
  triggers: Trigger[]; // Renamed from conditions
}

export interface FormStage extends WorkflowStageBase {
  type: "form";
  questions: FormQuestion[];
}

export interface FeedbackStage extends WorkflowStageBase {
  type: "feedback";
  message: string;
}

export interface OfferStage extends WorkflowStageBase {
  type: "offer";
  message: string;
}

export interface InterviewStage extends WorkflowStageBase {
  type: "interview";
  message: string;
  timeSlots: TimeSlot[];
  callLink: string;
}

export interface RejectionStage extends WorkflowStageBase {
  type: "rejection";
  message: string;
}

export type WorkflowStage =
  | FormStage
  | FeedbackStage
  | OfferStage
  | InterviewStage
  | RejectionStage;
