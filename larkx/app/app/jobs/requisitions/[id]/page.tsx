"use client";

import { mockJobs } from "@/mocks/jobRequisition";
import React from "react";
import { formatDistanceToNow } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";

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
      <div className="flex items-center gap-4 mb-6">
        <Link href="/jobs/requisitions">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-3xl font-bold">Requisition {mockJob.requisitionNumber}</h1>
          <p className="text-muted-foreground">View and manage requisition details</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
        <Card>
          <CardHeader>
            <CardTitle>Details</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Status</span>
                <span className={`text-sm px-3 py-1 rounded-full ${
                  {
                    draft: "bg-gray-100 text-gray-800",
                    pending_approval: "bg-yellow-100 text-yellow-800",
                    approved: "bg-green-100 text-green-800",
                    rejected: "bg-red-100 text-red-800",
                    closed: "bg-blue-100 text-blue-800",
                  }[mockJob.status]
                }`}>
                  {mockJob.status.replace("_", " ").toUpperCase()}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Priority</span>
                <span className={`text-sm px-3 py-1 rounded-full ${
                  {
                    low: "bg-blue-100 text-blue-800",
                    medium: "bg-yellow-100 text-yellow-800", 
                    high: "bg-red-100 text-red-800",
                  }[mockJob.priority]
                }`}>
                  {mockJob.priority.toUpperCase()}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Budget Approved</span>
                <span className="text-sm">{mockJob.budgetApproved ? "Yes" : "No"}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Target Start Date</span>
                <span className="text-sm">
                  {formatDistanceToNow(new Date(mockJob.targetStartDate), { addSuffix: true })}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Approvals</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-4">
              {mockJob.approvals.map((approval, index) => (
                <li key={index} className="flex justify-between items-start">
                  <div>
                    <p className="font-medium">
                      {approval.approver.firstName} {approval.approver.lastName}
                    </p>
                    {approval.comments && (
                      <p className="text-sm text-muted-foreground mt-1">{approval.comments}</p>
                    )}
                  </div>
                  <span className={`text-sm px-3 py-1 rounded-full ${
                    {
                      pending: "bg-yellow-100 text-yellow-800",
                      approved: "bg-green-100 text-green-800",
                      rejected: "bg-red-100 text-red-800"
                    }[approval.status]
                  }`}>
                    {approval.status.toUpperCase()}
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Reason for Hiring</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">{mockJob.reasonForHiring}</p>
          {mockJob.comments && (
            <>
              <h3 className="text-lg font-semibold mt-6 mb-2">Additional Comments</h3>
              <p className="text-sm text-muted-foreground">{mockJob.comments}</p>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
