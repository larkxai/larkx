export interface Job {
  id: string;
  title: string;
  department: string;
  location: string;
  description: string;
  type: "Full-time" | "Part-time" | "Contract";
  workflowId?: string;
  createdAt: Date;
}
