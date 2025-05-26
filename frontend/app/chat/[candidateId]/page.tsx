"use client";

import { useState, useEffect } from "react";
import { api } from "@/lib/api";
import { ChatClient } from "./ChatClient";
import { JobListing } from "@/@types/jobListings";

interface ChatPageProps {
  params: {
    candidateId: string;
  };
  searchParams: {
    jobId: string;
  };
}

async function getJobListing(jobId: string) {
  const jobListing = await api.jobs.getListingById(jobId);
  return jobListing;
}

export default function ChatPage({ params, searchParams }: ChatPageProps) {
  const [jobListing, setJobListing] = useState<JobListing | undefined>(
    undefined
  );

  useEffect(() => {
    const fetchJobListing = async () => {
      const listing = await getJobListing(searchParams.jobId);
      setJobListing(listing);
    };
    fetchJobListing();
  }, [searchParams.jobId]);

  if (!jobListing) {
    return <div>Loading...</div>;
  }

  return (
    <div className="container mx-auto py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold mb-2">{jobListing.title}</h1>
        <p className="text-gray-600">
          {jobListing.department} • {jobListing.location}
        </p>
      </div>
      <ChatClient
        candidateId={params.candidateId}
        jobId={searchParams.jobId}
        agentFlowId={jobListing.agentFlowId}
      />
    </div>
  );
}
