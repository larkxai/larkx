"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PlusCircle } from "lucide-react";
import { JobRequisition } from "@/@types/jobRequisition";
import { mockJobs } from "@/mocks/jobRequisition";
import { formatDistanceToNow } from "date-fns";

export default function JobsPage() {
  const [showNewJobForm, setShowNewJobForm] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [newJob, setNewJob] = useState<Partial<JobRequisition>>({
    requisitionNumber: "",
    reasonForHiring: "",
    priority: "medium",
    status: "draft",
    budgetApproved: false,
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Handle job creation logic here
    setShowNewJobForm(false);
  };

  const filteredJobs = mockJobs.filter((job) => {
    const matchesSearch =
      job.requisitionNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
      job.reasonForHiring.toLowerCase().includes(searchTerm.toLowerCase());

    return matchesSearch;
  });

  return (
    <div className="container mx-auto p-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold">Job Requisitions</h1>
          <p className="text-muted-foreground">Manage hiring requests</p>
        </div>
        <Button onClick={() => setShowNewJobForm(true)}>
          <PlusCircle className="mr-2 h-4 w-4" />
          Create Requisition
        </Button>
      </div>

      <div className="mb-6">
        <input
          type="text"
          placeholder="Search requisitions..."
          className="px-4 py-2 border rounded-md w-full max-w-sm"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>

      {/* Requisition Creation Form */}
      {showNewJobForm && (
        <Card className="mb-8">
          <CardHeader>
            <CardTitle>Create New Requisition</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Reason for Hiring</label>
                <textarea
                  value={newJob.reasonForHiring}
                  onChange={(e) =>
                    setNewJob({ ...newJob, reasonForHiring: e.target.value })
                  }
                  className="w-full p-2 border rounded h-32"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Priority</label>
                <select
                  value={newJob.priority}
                  onChange={(e) =>
                    setNewJob({ ...newJob, priority: e.target.value as JobRequisition["priority"] })
                  }
                  className="w-full p-2 border rounded"
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Target Start Date</label>
                <input
                  type="date"
                  onChange={(e) =>
                    setNewJob({ ...newJob, targetStartDate: new Date(e.target.value).toISOString() })
                  }
                  className="w-full p-2 border rounded"
                  required
                />
              </div>
              <div className="flex gap-2">
                <Button type="submit">Create Requisition</Button>
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

      {/* Requisitions List */}
      <div className="grid gap-4">
        {filteredJobs.map((job) => (
          <Card key={job.id}>
            <Link href={`/jobs/requisitions/${job.id}`}>
              <CardHeader>
                <div className="flex justify-between items-center">
                  <CardTitle className="flex items-center gap-4">
                    {job.requisitionNumber}
                    <span
                      className={`text-sm px-3 py-1 rounded-full ${
                        {
                          draft: "bg-gray-100 text-gray-800",
                          pending_approval: "bg-yellow-100 text-yellow-800",
                          approved: "bg-green-100 text-green-800",
                          rejected: "bg-red-100 text-red-800",
                          closed: "bg-blue-100 text-blue-800",
                        }[job.status]
                      }`}
                    >
                      {job.status.replace("_", " ").toUpperCase()}
                    </span>
                    <span
                      className={`text-sm px-3 py-1 rounded-full ${
                        {
                          low: "bg-blue-100 text-blue-800",
                          medium: "bg-yellow-100 text-yellow-800",
                          high: "bg-red-100 text-red-800",
                        }[job.priority]
                      }`}
                    >
                      {job.priority.toUpperCase()} Priority
                    </span>
                  </CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div>
                    <p className="text-sm text-muted-foreground">Reason</p>
                    <p>{job.reasonForHiring}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Budget</p>
                    <p>{job.budgetApproved ? "Approved" : "Pending"}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Target Start</p>
                    <p>{new Date(job.targetStartDate).toLocaleDateString()}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Updated</p>
                    <p>{formatDistanceToNow(new Date(job.updatedAt))} ago</p>
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
