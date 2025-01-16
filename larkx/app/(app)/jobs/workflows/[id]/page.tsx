"use client";

import { Workflow } from "@/@types/workflow";
import { EnhancedHiringWorkflowComponent } from "@/components/hiring-workflow";
import { Button } from "@/components/ui/button";
import { workflow as initialWorkflow } from "@/mocks/workflow";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

export default function WorkflowDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const [workflow, setWorkflow] = useState<Workflow>(initialWorkflow);

  console.log(params);

  const handleSave = async (updatedWorkflow: Workflow) => {
    try {
      const response = await fetch(`/api/workflows/${workflow.id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(updatedWorkflow),
      });

      if (!response.ok) {
        throw new Error("Failed to save workflow");
      }

      setWorkflow(updatedWorkflow);
    } catch (error) {
      console.error("Error saving workflow:", error);
    }
  };

  return (
    <div className="container mx-auto p-6">
      <div className="mb-6">
        <Link href="/jobs/workflows">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Workflows
          </Button>
        </Link>
      </div>
      <EnhancedHiringWorkflowComponent 
        workflow={workflow} 
        onSave={handleSave}
      />
    </div>
  );
}
