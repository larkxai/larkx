import { Metadata } from "./common";

export interface Team {
  id: string;
  name: string;
  logoUrl?: string;
}

export interface Organization extends Metadata {
  id: string;
  name: string;
  teams: Team[];
  currentPlan: {
    name: string;
    features: string[];
  };
}
