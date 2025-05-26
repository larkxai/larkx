'use client';

import { AgentFlow } from "@/@types/agent";
import { AgentChat } from "@/components/AgentChat";
import { api } from "@/lib/api";
import { useEffect, useState } from "react";

interface ChatClientProps {
  candidateId: string;
  jobId: string;
  agentFlowId: string;
}

export function ChatClient({ candidateId, jobId, agentFlowId }: ChatClientProps) {
  console.log("ChatClient", candidateId, jobId, agentFlowId);
  const [agentFlow, setAgentFlow] = useState<AgentFlow | null>(null);

  useEffect(() => {
    const fetchAgentFlow = async () => {
      const flow = await api.agents.getFlowById(agentFlowId);
      setAgentFlow(flow);
    };
    if (agentFlowId) {
      fetchAgentFlow();
    }
  }, [agentFlowId]);

  if (!agentFlow) {
    return <div>Loading...</div>;
  }

  return (
    <AgentChat
      candidateId={candidateId}
      jobId={jobId}
      agentFlow={agentFlow}
    />
  );
} 