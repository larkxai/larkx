"use client";

import React from 'react';
import { mockJobs } from '@/lib/mock-data';
import Link from 'next/link';
import { Button } from '@/components/ui/button';

export default function AgentsPage() {
  return (
    <div className="container mx-auto p-6 space-y-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Agent Management</h1>
        <Button asChild>
          <Link href="/app/jobs/requisitions/new">
            Create New Job
          </Link>
        </Button>
      </div>

      <div className="grid gap-6">
        {mockJobs.map((job) => (
          <div
            key={job.id}
            className="bg-white border rounded-xl shadow-sm p-6 hover:border-blue-500 transition-colors"
          >
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-semibold">{job.title}</h2>
                <p className="text-sm text-gray-500">
                  {job.agents.length} agent{job.agents.length !== 1 ? 's' : ''}
                </p>
              </div>
              <Button asChild variant="outline">
                <Link href={`/app/jobs/agents/${job.id}`}>Manage Agents</Link>
              </Button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {job.agents.map((agent) => (
                <div
                  key={agent.id}
                  className={`p-3 rounded-md border ${
                    agent.isPassive
                      ? 'border-dashed border-gray-400'
                      : 'border-solid border-blue-500'
                  } bg-gray-50`}
                >
                  <div className="font-medium">{agent.agentname || agent.type}</div>
                  <div className="text-sm text-gray-500">
                    {agent.order !== undefined ? `Order: ${agent.order}` : ''}
                  </div>
                  {agent.isPassive && (
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