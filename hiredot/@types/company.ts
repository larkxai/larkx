import { Metadata } from './common';

export interface CompanyLocation {
  address: string;
  city: string;
  state: string;
  country: string;
  postalCode: string;
  isPrimary: boolean;
}

export interface CompanyDepartment {
  name: string;
  headCount: number;
  budget?: number;
}

export interface Company extends Metadata {
  name: string;
  description?: string;
  industry: string;
  size: 'startup' | 'small' | 'medium' | 'large' | 'enterprise';
  website: string;
  logoUrl?: string;
  locations: CompanyLocation[];
  departments: CompanyDepartment[];
  linkedInUrl?: string;
  twitterHandle?: string;
  culture?: string[];
  benefits?: string[];
}
