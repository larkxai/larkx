"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PlusCircle } from "lucide-react";
import { mockJobs } from "@/mocks/roles";

export default function JobsPage() {
  const [showNewJobForm, setShowNewJobForm] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [newJob, setNewJob] = useState({
    title: "",
    description: "",
    workflowId: "",
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Handle job creation logic here
    setShowNewJobForm(false);
  };

  const filteredJobs = mockJobs.filter((job) => {
    const matchesSearch =
      job.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      job.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (job.workflowId &&
        job.workflowId.toLowerCase().includes(searchTerm.toLowerCase()));

    return matchesSearch;
  });

  return (
    <div className="container mx-auto p-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold">Jobs</h1>
          <p className="text-muted-foreground">Manage and track job roles</p>
        </div>
        <Button onClick={() => setShowNewJobForm(true)}>
          <PlusCircle className="mr-2 h-4 w-4" />
          Create New Job
        </Button>
      </div>

      <div className="mb-6">
        <input
          type="text"
          placeholder="Search jobs..."
          className="px-4 py-2 border rounded-md w-full max-w-sm"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>

      {/* Job Creation Form */}
      {showNewJobForm && (
        <Card className="mb-8">
          <CardHeader>
            <CardTitle>Create New Job</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Title</label>
                <input
                  type="text"
                  value={newJob.title}
                  onChange={(e) =>
                    setNewJob({ ...newJob, title: e.target.value })
                  }
                  className="w-full p-2 border rounded"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">
                  Description
                </label>
                <textarea
                  value={newJob.description}
                  onChange={(e) =>
                    setNewJob({ ...newJob, description: e.target.value })
                  }
                  className="w-full p-2 border rounded h-32"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">
                  Workflow ID
                </label>
                <input
                  type="text"
                  value={newJob.workflowId}
                  onChange={(e) =>
                    setNewJob({ ...newJob, workflowId: e.target.value })
                  }
                  className="w-full p-2 border rounded"
                  placeholder="Optional"
                />
              </div>
              <div className="flex gap-2">
                <Button type="submit">Create Job</Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowNewJobForm(false)}
                >
                  Cancel
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Jobs List */}
      <div className="grid gap-4">
        {filteredJobs.map((job) => (
          <Card key={job.id}>
            <Link href={`/jobs/roles/${job.id}`}>
              <CardHeader>
                <CardTitle>{job.title}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div>
                    <p className="text-sm text-muted-foreground">Description</p>
                    <p>{job.description}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Workflow</p>
                    <p>{job.workflowId || "No workflow"}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Created</p>
                    <p>{job.createdAt.toLocaleDateString()}</p>
                  </div>
                </div>
              </CardContent>
            </Link>
          </Card>
        ))}
      </div>
    </div>
  );
}
