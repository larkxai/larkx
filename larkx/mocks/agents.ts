import { Agent, AgentFlow, AgentMode } from "../@types/agent";

export const mockAgentFlows: AgentFlow[] = [
  {
    id: "flow1",
    name: "Software Engineer Flow",
    description: "Standard flow for software engineering positions",
    createdBy: "system",
    isTemplate: true,
    version: 1,
    createdAt: new Date("2024-03-15"),
    agents: [
      {
        id: "agent1",
        flowId: "flow1",
        type: "FormAgent",
        name: "Agent 1",
        mode: AgentMode.Linear,
        after: null,
        config: {
          fields: [
            {
              name: "fullName",
              label: "Full Name",
              type: "text",
              required: true,
            },
            { name: "email", label: "Email", type: "email", required: true },
            {
              name: "experience",
              label: "Years of Experience",
              type: "number",
              required: true,
            },
          ],
        },
      } as Agent,
      {
        id: "agent2",
        flowId: "flow1",
        type: "ReminderAgent",
        name: "Agent 2",
        mode: AgentMode.Passive,
        config: {
          message: "Please complete your application",
          delay: "24h",
        },
      } as Agent,
    ],
  },
  {
    id: "flow2",
    name: "Product Manager Flow",
    description: "Standard flow for product management positions",
    createdBy: "system",
    isTemplate: true,
    version: 1,
    createdAt: new Date("2024-03-15"),
    agents: [
      {
        id: "agent3",
        flowId: "flow2",
        type: "FormAgent",
        name: "Agent 1",
        mode: AgentMode.Linear,
        after: null,
        config: {
          fields: [
            {
              name: "fullName",
              label: "Full Name",
              type: "text",
              required: true,
            },
            { name: "email", label: "Email", type: "email", required: true },
            {
              name: "portfolio",
              label: "Portfolio URL",
              type: "url",
              required: true,
            },
          ],
        },
      } as Agent,
    ],
  },
];
