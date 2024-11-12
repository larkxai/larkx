"use client"

import { EnhancedHiringWorkflowComponent } from "@/components/hiring-workflow"
import { Button } from "@/components/ui/button"
import { ArrowLeft } from "lucide-react"
import Link from "next/link"

export default function WorkflowDetailPage({ params }: { params: { id: string } }) {
  return (
    <div className="container mx-auto p-6">
      <div className="mb-6">
        <Link href="/workflows">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Workflows
          </Button>
        </Link>
      </div>
      <EnhancedHiringWorkflowComponent />
    </div>
  )
} 