"use client";

import React from 'react';
import { AgentGraph } from '@/components/agent-graph';
import { AgentConfigPanel } from '@/components/agent-config-panel';
import { mockJobs, type Job, type Agent } from '@/mocks/agents';
import { Button } from '@/components/ui/button';

export default function AgentEditorPage({ params }: { params: { id: string } }) {
  const [selectedAgent, setSelectedAgent] = React.useState<Agent | null>(null);
  const [job, setJob] = React.useState<Job | null>(null);

  // Load job data
  React.useEffect(() => {
    const foundJob = mockJobs.find(j => j.id === params.id);
    if (foundJob) {
      setJob(foundJob);
      // Sort agents by order
      foundJob.agents.sort((a, b) => a.order - b.order);
    }
  }, [params.id]);

  const handleAgentClick = (agent: Agent) => {
    setSelectedAgent(agent);
  };

  const handleConfigSave = (updatedAgent: Agent) => {
    if (!job) return;
    const updatedAgents = job.agents.map(agent =>
      agent.id === updatedAgent.id ? updatedAgent : agent
    );
    setJob({
      ...job,
      agents: updatedAgents,
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
        <h2 className="text-lg font-semibold mb-4">{job.title}</h2>
        <div className="space-y-2">
          {job.agents.map(agent => (
            <div
              key={agent.id}
              onClick={() => handleAgentClick(agent)}
              className={`p-2 rounded cursor-pointer ${
                selectedAgent?.id === agent.id ? 'bg-blue-100' : 'hover:bg-gray-100'
              }`}
            >
              <div className="font-medium">{agent.type}</div>
              <div className="text-sm text-gray-500">Order: {agent.order}</div>
            </div>
          ))}
        </div>
        <Button
          className="mt-4 w-full"
          onClick={() => {
            if (!job) return;
            const lastAgent = job.agents[job.agents.length - 1];
            const newAgent = {
              id: `agent_${Date.now()}`,
              type: 'FormAgent',
              after: lastAgent ? lastAgent.id : null,
              config: {},
            };
            const updatedAgents = [...job.agents, newAgent];
            setJob({ ...job, agents: updatedAgents });
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
            <AgentGraph agents={job.agents} onNodeClick={handleAgentClick} />
          </div>
        </div>
        {/* Config Panel (Right) */}
        <div className="w-[400px] h-full border-l border-gray-200 bg-white">
          <AgentConfigPanel
            agent={selectedAgent}
            agents={job.agents}
            onSave={handleConfigSave}
          />
        </div>
      </div>
    </div>
  );
} 