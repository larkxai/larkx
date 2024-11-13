import { mockJobs } from "@/mocks/roles";
import React from "react";

interface JobDetailsPageProps {
  params: {
    id: string;
  };
}

export default function JobDetailsPage({ params }: JobDetailsPageProps) {
  // This is a mock job data - in real app you'd fetch this from an API
  const mockJob = mockJobs.find((job) => job.id === params.id);

  if (!mockJob) {
    return <div>Job not found</div>;
  }

  return (
    <div className="container mx-auto p-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold">{mockJob.title}</h1>
        <p className="text-muted-foreground">View and manage job details</p>
      </div>

      <div className="grid grid-cols-2 gap-6 mb-6">
        <div className="bg-card p-6 rounded-lg border">
          <h2 className="text-xl font-semibold mb-4">Details</h2>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Department:{" "}
              <span className="text-foreground">{mockJob.department}</span>
            </p>
            <p className="text-sm text-muted-foreground">
              Location:{" "}
              <span className="text-foreground">{mockJob.location}</span>
            </p>
            <p className="text-sm text-muted-foreground">
              Total Applicants:{" "}
              <span className="text-foreground">{mockJob.applicants}</span>
            </p>
          </div>
        </div>

        <div className="bg-card p-6 rounded-lg border">
          <h2 className="text-xl font-semibold mb-4">Requirements</h2>
          <ul className="space-y-2">
            {mockJob.requirements.map((req, index) => (
              <li key={index} className="text-sm text-muted-foreground">
                {req}
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="bg-card p-6 rounded-lg border">
        <h2 className="text-xl font-semibold mb-4">Description</h2>
        <p className="text-sm text-muted-foreground">{mockJob.description}</p>
      </div>
    </div>
  );
}
