import { ISODateString } from "./common";
import { UserId } from "./user";

export interface Department {
  id: string;
  name: string;
  description?: string;
  parentDepartment?: string;
  head?: UserId;
}

export interface Company {
  id: string;
  name: string;
  locations: Location[];
  departments: Department[];
  settings: CompanySettings;
  subscription: SubscriptionInfo;
  branding: CompanyBranding;
}

export interface Location {
  id: string;
  name: string;
  address: {
    street: string;
    city: string;
    state: string;
    country: string;
    postalCode: string;
  };
  timezone: string;
  isHeadquarters?: boolean;
}

export interface CompanySettings {
  defaultLanguage: string;
  supportedLanguages: string[];
  defaultTimezone: string;
  workflowSettings: {
    requireApproval: boolean;
    autoArchiveDays: number;
  };
  privacySettings: {
    dataRetentionPeriod: number;
    gdprCompliance: boolean;
  };
}

export interface SubscriptionInfo {
  plan: "free" | "starter" | "professional" | "enterprise";
  status: "active" | "trialing" | "past_due" | "canceled";
  seats: number;
  features: string[];
  startDate: ISODateString;
  endDate?: ISODateString;
}

export interface CompanyBranding {
  logo?: string;
  colors: {
    primary: string;
    secondary: string;
    accent: string;
  };
  careerSiteUrl?: string;
  emailTemplates: Record<string, string>;
}
