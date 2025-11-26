import { User } from "@/@types/user";
import { Organization } from "@/@types/organization";

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
  organizations: {
    getCurrent: async (): Promise<Organization> => {
      const response = await fetch(`${API_BASE_URL}/api/organizations/current`);
      return response.json();
    },
  },
  auth: {
    login: async (credentials: { email: string; password: string }) => {
      const response = await fetch(`${API_BASE_URL}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(credentials),
      });

      if (!response.ok) {
        throw new Error("Invalid credentials");
      }

      return response.json();
    },
    signup: async (payload: { firstName: string; lastName: string; email: string; password: string }) => {
      const response = await fetch(`${API_BASE_URL}/api/auth/signup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error("Failed to sign up");
      }

      return response.json();
    },
    logout: async (token: string): Promise<void> => {
      const response = await fetch(`${API_BASE_URL}/api/auth/logout`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error("Failed to logout");
      }
    },
  },
};
