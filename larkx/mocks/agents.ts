import { Agent, AgentFlow, AgentMode, Job } from '../@types/agent';

export const mockAgentFlows: AgentFlow[] = [
  {
    id: 'flow1',
    name: 'Software Engineer Flow',
    description: 'Standard flow for software engineering positions',
    createdBy: 'system',
    isTemplate: true,
    version: 1,
    createdAt: new Date('2024-03-15'),
    agents: [
      {
        id: 'agent1',
        flowId: 'flow1',
        type: 'FormAgent',
        order: 1,
        mode: AgentMode.Linear,
        config: {
          fields: [
            { name: 'fullName', label: 'Full Name', type: 'text', required: true },
            { name: 'email', label: 'Email', type: 'email', required: true },
            { name: 'experience', label: 'Years of Experience', type: 'number', required: true },
          ],
        },
      } as Agent,
      {
        id: 'agent2',
        flowId: 'flow1',
        type: 'ReminderAgent',
        order: 2,
        mode: AgentMode.Passive,
        config: {
          message: 'Please complete your application',
          delay: '24h',
        },
      } as Agent,
    ],
  },
  {
    id: 'flow2',
    name: 'Product Manager Flow',
    description: 'Standard flow for product management positions',
    createdBy: 'system',
    isTemplate: true,
    version: 1,
    createdAt: new Date('2024-03-15'),
    agents: [
      {
        id: 'agent3',
        flowId: 'flow2',
        type: 'FormAgent',
        order: 1,
        mode: AgentMode.Linear,
        config: {
          fields: [
            { name: 'fullName', label: 'Full Name', type: 'text', required: true },
            { name: 'email', label: 'Email', type: 'email', required: true },
            { name: 'portfolio', label: 'Portfolio URL', type: 'url', required: true },
          ],
        },
      } as Agent,
    ],
  },
];

export const mockJobs: Job[] = [
  {
    id: 'job1',
    title: 'Software Engineer',
    flowId: 'flow1',
    flow: mockAgentFlows[0],
  },
  {
    id: 'job2',
    title: 'Product Manager',
    flowId: 'flow2',
    flow: mockAgentFlows[1],
  },
];

export interface Candidate {
  id: string;
  jobId: string;
  formData: Record<string, string | number>;
  completedAgents: string[];
  currentStage: string;
  createdAt: Date;
}

export const mockCandidates: Candidate[] = [
  {
    id: 'candidate1',
    jobId: 'job1',
    formData: {
      fullName: 'John Doe',
      email: 'john@example.com',
      experience: '5',
    },
    completedAgents: ['agent1'],
    currentStage: 'form_submitted',
    createdAt: new Date('2024-03-15'),
  },
  {
    id: 'candidate2',
    jobId: 'job2',
    formData: {
      fullName: 'Jane Smith',
      email: 'jane@example.com',
      portfolio: 'https://janesmith.com',
    },
    completedAgents: ['agent3'],
    currentStage: 'form_submitted',
    createdAt: new Date('2024-03-16'),
  },
]; 