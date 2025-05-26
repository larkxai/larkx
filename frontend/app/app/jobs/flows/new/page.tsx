"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { api } from "@/lib/api";
import { AgentFlow } from "@/@types/agent";

export default function NewFlowPage() {
  const router = useRouter();
  const [flows, setFlows] = React.useState<AgentFlow[]>([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    const fetchFlows = async () => {
      try {
        const fetchedFlows = await api.agents.getAllFlows();
        setFlows(fetchedFlows);
      } catch (error) {
        console.error('Error fetching flows:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchFlows();
  }, []);

  if (loading) {
    return <div>Loading...</div>;
  }

  return (
    <div className="container mx-auto p-6 space-y-8">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">Create New Flow</h1>
        <Button onClick={() => router.back()}>Back</Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Start from Scratch</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between p-4 border rounded-lg hover:bg-gray-50 cursor-pointer"
               onClick={async () => {
                 try {
                   const newFlow = await api.agents.createFlow({
                     name: `New Flow (${new Date().toLocaleString()})`,
                     description: "Flow created from scratch",
                     isTemplate: false
                   });
                   router.push(`/app/jobs/flows/${newFlow.id}`);
                 } catch (error) {
                   console.error('Error creating new flow:', error);
                 }
               }}>
            <div>
              <h3 className="font-medium">Empty Flow</h3>
              <p className="text-sm text-gray-500">Create a new flow from scratch</p>
            </div>
            <Button variant="ghost">Create Empty</Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Start from Template</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4">
            {flows
              .filter(flow => flow.isTemplate)
              .map((flow) => (
                <div
                  key={flow.id}
                  className="flex items-center justify-between p-4 border rounded-lg hover:bg-gray-50 cursor-pointer"
                  onClick={() => router.push(`/app/jobs/flows/${flow.id}`)}
                >
                  <div>
                    <h3 className="font-medium">{flow.name}</h3>
                    <p className="text-sm text-gray-500">{flow.description}</p>
                  </div>
                  <Button variant="ghost">Use Template</Button>
                </div>
              ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
} 