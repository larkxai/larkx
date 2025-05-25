"use client";

import React from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { PlusIcon } from "lucide-react";
import { AgentMode } from "@/@types/agent";
import { mockAgentFlows } from "@/mocks/agents";

export default function FlowsPage() {
  return (
    <div className="container mx-auto p-6 space-y-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Agent Flows</h1>
        <Button asChild>
          <Link href="/app/jobs/flows/new">
            <div className="flex items-center gap-2">
              <PlusIcon className="w-4 h-4" />
              New Flow
            </div>
          </Link>
        </Button>
      </div>

      <div className="grid gap-6">
        {mockAgentFlows.map((flow) => (
          <div
            key={flow.id}
            className="bg-white border rounded-xl shadow-sm p-6 hover:border-blue-500 transition-colors"
          >
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-semibold">{flow.name}</h2>
                <p className="text-sm text-gray-500">{flow.description}</p>
              </div>
              <Button asChild variant="outline">
                <Link href={`/app/jobs/flows/${flow.id}`}>Manage</Link>
              </Button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {flow.agents.map((agent) => (
                <div
                  key={agent.id}
                  className={`p-3 rounded-md border ${
                    agent.mode === AgentMode.Passive
                      ? "border-dashed border-gray-400"
                      : "border-solid border-blue-500"
                  } bg-gray-50`}
                >
                  <div className="font-medium">{agent.type}</div>
                  {agent.mode === AgentMode.Passive && (
                    <div className="text-xs text-gray-500 mt-1">
                      Passive Agent
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
