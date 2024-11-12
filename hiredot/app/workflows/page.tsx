"use client"

import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { PlusCircle, GitBranch, Users, Calendar, ArrowRight } from "lucide-react"
import Link from "next/link"

// Mock data for workflows
const workflows = [
  {
    id: 1,
    name: "Standard Hiring Process",
    description: "Default workflow for most positions",
    stages: 5,
    activeApplications: 24,
    averageTime: "15 days",
  },
  {
    id: 2,
    name: "Executive Recruitment",
    description: "Specialized workflow for senior positions",
    stages: 7,
    activeApplications: 3,
    averageTime: "30 days",
  },
  {
    id: 3,
    name: "Internship Program",
    description: "Streamlined process for interns",
    stages: 4,
    activeApplications: 45,
    averageTime: "7 days",
  },
  {
    id: 4,
    name: "Contractor Onboarding",
    description: "Quick process for contractors",
    stages: 3,
    activeApplications: 12,
    averageTime: "5 days",
  },
]

export default function WorkflowsPage() {
  return (
    <div className="container mx-auto p-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold">Workflows</h1>
          <p className="text-muted-foreground">
            Manage and customize your hiring workflows
          </p>
        </div>
        <Button>
          <PlusCircle className="mr-2 h-4 w-4" />
          Create Workflow
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {workflows.map((workflow) => (
          <Card key={workflow.id}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <GitBranch className="h-5 w-5" />
                {workflow.name}
              </CardTitle>
              <CardDescription>{workflow.description}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <div className="flex items-center text-sm">
                  <GitBranch className="mr-2 h-4 w-4" />
                  <span>{workflow.stages} stages</span>
                </div>
                <div className="flex items-center text-sm">
                  <Users className="mr-2 h-4 w-4" />
                  <span>{workflow.activeApplications} active applications</span>
                </div>
                <div className="flex items-center text-sm">
                  <Calendar className="mr-2 h-4 w-4" />
                  <span>Avg. time: {workflow.averageTime}</span>
                </div>
              </div>
            </CardContent>
            <CardFooter className="flex justify-between">
              <Button variant="outline" size="sm">
                Edit
              </Button>
              <Link href={`/workflows/${workflow.id}`}>
                <Button size="sm">
                  View Details
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </Link>
            </CardFooter>
          </Card>
        ))}
      </div>
    </div>
  )
} 