import { User } from "@/@types/user";
import { Agent, AgentFlow } from "@/@types/agent";
import { Organization } from "@/@types/organization";
import { JobListing } from "@/@types/jobListings";
import { Candidate } from "@/@types/candidates";

const API_BASE_URL = "http://localhost:3000";

export const api = {
  users: {
    getAll: async (): Promise<User[]> => {
      const response = await fetch(`${API_BASE_URL}/api/users`);
      return response.json();
    },
    getById: async (id: string): Promise<User> => {
      const response = await fetch(`${API_BASE_URL}/api/users/${id}`);
      return response.json();
    },
  },
  agents: {
    getAllFlows: async (): Promise<AgentFlow[]> => {
      const response = await fetch(`${API_BASE_URL}/api/agents/flows`);
      return response.json();
    },
    getFlowById: async (id: string): Promise<AgentFlow> => {
      const response = await fetch(`${API_BASE_URL}/api/agents/flows/${id}`);
      return response.json();
    },
    getAgentById: async (flowId: string, agentId: string): Promise<Agent> => {
      const response = await fetch(
        `${API_BASE_URL}/api/agents/flows/${flowId}/agents/${agentId}`
      );
      return response.json();
    },
    createFlow: async (data: { name: string; description: string; isTemplate: boolean }): Promise<AgentFlow> => {
      const response = await fetch(`${API_BASE_URL}/api/agents/flows`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      });
      return response.json();
    },
    updateFlow: async (id: string, data: AgentFlow): Promise<AgentFlow> => {
      const response = await fetch(`${API_BASE_URL}/api/agents/flows/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      });
      if (!response.ok) {
        throw new Error('Failed to update flow');
      }
      return response.json();
    },
  },
  organizations: {
    getCurrent: async (): Promise<Organization> => {
      const response = await fetch(`${API_BASE_URL}/api/organizations/current`);
      return response.json();
    },
  },
  jobs: {
    getListings: async (): Promise<JobListing[]> => {
      const response = await fetch(`${API_BASE_URL}/api/jobs/listings`);
      if (!response.ok) {
        throw new Error('Failed to fetch job listings');
      }
      return response.json();
    },
    getListingById: async (id: string): Promise<JobListing> => {
      const response = await fetch(`${API_BASE_URL}/api/jobs/listings/${id}`);
      if (!response.ok) {
        throw new Error('Failed to fetch job listing');
      }
      return response.json();
    },
    createListing: async (data: Partial<JobListing>): Promise<JobListing> => {
      const response = await fetch(`${API_BASE_URL}/api/jobs/listings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!response.ok) throw new Error('Failed to create job listing');
      return response.json();
    },
  },
  candidates: {
    getAll: async (): Promise<Candidate[]> => {
      const response = await fetch(`${API_BASE_URL}/api/candidates`);
      return response.json();
    },
    getById: async (id: string): Promise<Candidate> => {
      const response = await fetch(`${API_BASE_URL}/api/candidates/${id}`);
      return response.json();
    },
    create: async (data: { name: string; email: string; jobId: string }): Promise<Candidate> => {
      console.log(API_BASE_URL);
      const response = await fetch(`${API_BASE_URL}/api/candidates`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      });
      return response.json();
    },
  },
  agent: {
    trigger: async (params: { 
      candidateId: string; 
      flowId: string; 
      message?: string;
      agentId: string;
      agentType: string;
      formData?: Record<string, string>;
      history?: any[];
    }) => {
      const response = await fetch(`${API_BASE_URL}/api/agents/trigger`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(params),
      });
      return response.json();
    },
  },
  auth: {
    login: async (credentials: { email: string; password: string }) => {
      const response = await fetch(`${API_BASE_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(credentials),
      });

      if (!response.ok) {
        throw new Error('Invalid credentials');
      }

      return response.json();
    },
    logout: async (token: string): Promise<void> => {
      const response = await fetch(`${API_BASE_URL}/api/auth/logout`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to logout');
      }
    },
  },
};
