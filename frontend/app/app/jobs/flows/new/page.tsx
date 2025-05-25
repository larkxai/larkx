"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { AgentFlow } from "@/@types/agent";
import { mockAgentFlows } from "@/mocks/agents";

export default function NewFlowPage() {
  const router = useRouter();

  React.useEffect(() => {
    // Generate a default name with timestamp
    const timestamp = new Date().toLocaleString('en-US', {
      year: 'numeric',
      month: 'short', 
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
    const defaultName = `Flow ${timestamp}`;

    // Create a new flow with default values
    const newFlow: AgentFlow = {
      id: `flow_${Date.now()}`,
      name: defaultName,
      description: "New agent flow",
      createdBy: "user",
      isTemplate: false,
      version: 1,
      createdAt: new Date(),
      agents: [],
    };

    // In a real application, this would be an API call to create the flow
    // For now, we'll just add it to our mock data
    mockAgentFlows.push(newFlow);

    // Redirect to the flow editor page
    router.push(`/app/jobs/flows/${newFlow.id}`);
  }, [router]);

  return (
    <div className="flex items-center justify-center h-screen">
      <div className="text-gray-500">Creating new flow...</div>
    </div>
  );
} 