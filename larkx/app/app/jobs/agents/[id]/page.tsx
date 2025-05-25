"use client";

import React from 'react';
import { AgentGraph } from '@/components/agent-graph';
import { AgentConfigPanel } from '@/components/agent-config-panel';
import { mockJobs } from '@/mocks/agents';
import { Button } from '@/components/ui/button';
import { AgentMode, Agent, Job } from '@/@types/agent';

export default function AgentEditorPage({ params }: { params: { id: string } }) {
  const [selectedAgent, setSelectedAgent] = React.useState<Agent | null>(null);
  const [job, setJob] = React.useState<Job | null>(null);

  // Load job data
  React.useEffect(() => {
    const foundJob = mockJobs.find(j => j.id === params.id);
    if (foundJob) {
      setJob(foundJob);
      // Sort agents by order
      foundJob.flow.agents.sort((a, b) => a.order - b.order);
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
              <div className="font-medium">{agent.type}</div>
              <div className="text-sm text-gray-500">Order: {agent.order}</div>
              {agent.mode === AgentMode.Passive && (
                <div className="text-xs text-gray-500">Passive</div>
              )}
            </div>
          ))}
        </div>
        <Button
          className="mt-4 w-full"
          onClick={() => {
            if (!job) return;
            const lastAgent = job.flow.agents[job.flow.agents.length - 1];
            const newAgent = {
              id: `agent_${Date.now()}`,
              flowId: job.flow.id,
              type: 'FormAgent',
              order: lastAgent ? lastAgent.order + 1 : 1,
              mode: AgentMode.Linear,
              config: {
                fields: []
              }
            } as Agent;
            const updatedAgents = [...job.flow.agents, newAgent];
            setJob({
              ...job,
              flow: {
                ...job.flow,
                agents: updatedAgents
              }
            });
          }}
        >
          Add Agent
        </Button>
      </div>

      {/* Main Content: Graph + Config Panel */}
      <div className="flex-1 flex flex-row h-full">
        {/* Graph View */}
        <div className="flex-1 p-4 border-r border-gray-200 overflow-auto h-full flex flex-col">
          <div className="flex-1 min-h-0">
            <AgentGraph agents={job.flow.agents} onNodeClick={handleAgentClick} />
          </div>
        </div>
        {/* Config Panel (Right) */}
        <div className="w-[400px] h-full border-l border-gray-200 bg-white">
          <AgentConfigPanel
            agent={selectedAgent}
            onSave={handleConfigSave}
          />
        </div>
      </div>
    </div>
  );
} 