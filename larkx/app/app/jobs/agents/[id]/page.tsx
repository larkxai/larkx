"use client";

import React from 'react';
import { AgentGraph } from '@/components/agent-graph';
import { AgentConfigPanel } from '@/components/agent-config-panel';
import { mockJobs } from '@/mocks/agents';
import { Button } from '@/components/ui/button';
import { AgentMode, Agent, Job } from '@/@types/agent';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem
} from '@/components/ui/dropdown-menu';

export default function AgentEditorPage({ params }: { params: { id: string } }) {
  const [selectedAgent, setSelectedAgent] = React.useState<Agent | null>(null);
  const [job, setJob] = React.useState<Job | null>(null);

  // Load job data
  React.useEffect(() => {
    const foundJob = mockJobs.find(j => j.id === params.id);
    if (foundJob) {
      setJob(foundJob);
      // Remove sorting by order, as 'order' no longer exists
    }
  }, [params.id]);

  const handleAgentClick = (agent: Agent) => {
    setSelectedAgent(agent);
  };

  const handleConfigSave = (updatedAgent: Agent) => {
    if (!job) return;
    const updatedAgents = job.flow.agents.map(agent =>
      agent.id === updatedAgent.id ? updatedAgent : agent
    );
    setJob({
      ...job,
      flow: {
        ...job.flow,
        agents: updatedAgents,
      }
    });
    setSelectedAgent(updatedAgent);
  };

  // Helper to generate a unique agent id
  function generateAgentId() {
    return 'agent_' + Math.random().toString(36).slice(2, 10) + Date.now();
  }

  if (!job) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-gray-500">Job not found</div>
      </div>
    );
  }

  return (
    <div className="flex h-screen">
      {/* Sidebar */}
      <div className="w-64 bg-gray-50 border-r border-gray-200 p-4">
        <h2 className="text-lg font-semibold mb-2">{job.title}</h2>
        <p className="text-sm text-gray-500 mb-4">{job.flow.name}</p>
        <div className="space-y-2">
          {job.flow.agents.map((agent: Agent) => (
            <div
              key={agent.id}
              onClick={() => handleAgentClick(agent)}
              className={`p-2 rounded cursor-pointer ${
                selectedAgent?.id === agent.id ? 'bg-blue-100' : 'hover:bg-gray-100'
              }`}
            >
              <div className="font-medium">{agent.name}</div>
            </div>
          ))}
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button className="mt-4 w-full">Add Agent</Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuItem
              onClick={() => {
                if (!job) return;
                const linearAgents = job.flow.agents.filter(a => a.mode === AgentMode.Linear);
                const lastLinear = linearAgents[linearAgents.length - 1];
                const agentNumbers = job.flow.agents.map(a => {
                  const match = a.name.match(/Agent (\d+)/);
                  return match ? parseInt(match[1], 10) : 0;
                });
                const nextNumber = Math.max(0, ...agentNumbers) + 1;
                const newAgent = {
                  id: generateAgentId(),
                  flowId: job.flow.id,
                  type: 'FormAgent',
                  name: `Agent ${nextNumber}`,
                  mode: AgentMode.Linear,
                  after: lastLinear ? lastLinear.id : null,
                  config: { fields: [] }
                } as Agent;
                const updatedAgents = [...job.flow.agents, newAgent];
                setJob({
                  ...job,
                  flow: { ...job.flow, agents: updatedAgents }
                });
              }}
            >Form Agent</DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => {
                if (!job) return;
                const agentNumbers = job.flow.agents.map(a => {
                  const match = a.name.match(/Agent (\d+)/);
                  return match ? parseInt(match[1], 10) : 0;
                });
                const nextNumber = Math.max(0, ...agentNumbers) + 1;
                const newAgent = {
                  id: generateAgentId(),
                  flowId: job.flow.id,
                  type: 'ReminderAgent',
                  name: `Agent ${nextNumber}`,
                  mode: AgentMode.Passive,
                  config: { message: '', delay: '' }
                } as Agent;
                const updatedAgents = [...job.flow.agents, newAgent];
                setJob({
                  ...job,
                  flow: { ...job.flow, agents: updatedAgents }
                });
              }}
            >Reminder Agent</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Main Content: Graph + Config Panel */}
      <div className="flex-1 flex flex-row h-full">
        {/* Graph View */}
        <div className="flex-1 p-4 border-r border-gray-200 overflow-auto h-full flex flex-col">
          <div className="flex-1 min-h-0">
            <AgentGraph agents={job.flow.agents} onNodeClick={handleAgentClick} selectedAgentId={selectedAgent?.id} />
          </div>
        </div>
        {/* Config Panel (Right) */}
        <div className="w-[400px] h-full border-l border-gray-200 bg-white">
          <AgentConfigPanel
            agent={selectedAgent}
            onSave={handleConfigSave}
            agents={job.flow.agents}
          />
        </div>
      </div>
    </div>
  );
} 