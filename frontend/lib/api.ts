import { User } from '@/@types/user';
import { Agent, AgentFlow } from '@/@types/agent';
import { Organization } from '@/@types/organization';
import { JobListing } from '@/@types/jobListings';
import { Candidate } from '@/@types/candidates';

const API_BASE_URL = 'http://localhost:3000';

export const api = {
  users: {
    getAll: async (): Promise<User[]> => {
      const response = await fetch(`${API_BASE_URL}/users`);
      return response.json();
    },
    getById: async (id: string): Promise<User> => {
      const response = await fetch(`${API_BASE_URL}/users/${id}`);
      return response.json();
    },
  },
  agents: {
    getAllFlows: async (): Promise<AgentFlow[]> => {
      const response = await fetch(`${API_BASE_URL}/agents/flows`);
      return response.json();
    },
    getFlowById: async (id: string): Promise<AgentFlow> => {
      const response = await fetch(`${API_BASE_URL}/agents/flows/${id}`);
      return response.json();
    },
    getAgentById: async (flowId: string, agentId: string): Promise<Agent> => {
      const response = await fetch(`${API_BASE_URL}/agents/flows/${flowId}/agents/${agentId}`);
      return response.json();
    },
  },
  organizations: {
    getCurrent: async (): Promise<Organization> => {
      const response = await fetch(`${API_BASE_URL}/organizations/current`);
      return response.json();
    },
  },
  jobs: {
    getListings: async (): Promise<JobListing[]> => {
      const response = await fetch(`${API_BASE_URL}/jobs/listings`);
      return response.json();
    },
    getListingById: async (id: string): Promise<JobListing> => {
      const response = await fetch(`${API_BASE_URL}/jobs/listings/${id}`);
      return response.json();
    },
  },
  candidates: {
    getAll: async (): Promise<Candidate[]> => {
      const response = await fetch(`${API_BASE_URL}/candidates`);
      return response.json();
    },
    getById: async (id: string): Promise<Candidate> => {
      const response = await fetch(`${API_BASE_URL}/candidates/${id}`);
      return response.json();
    },
  },
}; 