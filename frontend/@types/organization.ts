import { Metadata } from "./common";

export interface Organization extends Metadata {
  name: string;
  description?: string;
  industry: string;
  website: string;
  teams: {
    name: string;
    members: string[];
  }[];
}
