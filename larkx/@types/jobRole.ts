import { Metadata } from './common';

export interface CompetencyLevel {
  name: string;
  description: string;
  requiredSkills: string[];
  yearsOfExperience: number;
}

export interface JobRole extends Metadata {
  title: string;
  description: string;
  department: string;
  level: string;
  competencies: CompetencyLevel[];
  careerPath?: string[];
  responsibilities: string[];
  requiredQualifications: string[];
  preferredQualifications?: string[];
}
