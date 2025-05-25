"use client";

import React from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { api } from "@/lib/api";
import { AgentFlow } from "@/@types/agent";

export default function FlowDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const [flow, setFlow] = React.useState<AgentFlow | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    const fetchFlow = async () => {
      try {
        const fetchedFlow = await api.agents.getFlowById(params.id);
        setFlow(fetchedFlow);
      } catch (error) {
        console.error('Error fetching flow:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchFlow();
  }, [params.id]);

  if (loading) {
    return <div>Loading...</div>;
  }

  if (!flow) {
    return <div>Flow not found</div>;
  }

  return (
    <div className="container mx-auto p-6 space-y-8">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">{flow.name}</h1>
        <Button>Edit Flow</Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Agents</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {flow.agents.map((agent) => (
              <div
                key={agent.id}
                className="flex items-center justify-between p-4 border rounded-lg"
              >
                <div>
                  <h3 className="font-medium">{agent.name}</h3>
                  <p className="text-sm text-gray-500">{agent.type}</p>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost">Actions</Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent>
                    <DropdownMenuItem>Edit</DropdownMenuItem>
                    <DropdownMenuItem>Delete</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
