import { Metadata, ID, ISODateString } from "./common";
import { User } from "./user";

export type RequisitionStatus =
  | "draft"
  | "pending_approval"
  | "approved"
  | "rejected"
  | "closed";

export interface Approval {
  approverId: ID;
  approver: User;
  status: "pending" | "approved" | "rejected";
  comments?: string;
  timestamp: ISODateString;
}

export interface JobRequisition extends Metadata {
  requisitionNumber: string;
  jobListingId: ID;
  hiringManagerId: ID;
  departmentId: ID;
  status: RequisitionStatus;
  priority: "low" | "medium" | "high";
  reasonForHiring: string;
  budgetApproved: boolean;
  targetStartDate: ISODateString;
  workflowId: ID;
  approvals: Approval[];
  comments?: string;
}
