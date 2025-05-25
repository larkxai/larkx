import { AgentChat } from '@/components/AgentChat';
import { api } from '@/lib/api';

interface ChatPageProps {
  params: {
    candidateId: string;
  };
  searchParams: {
    jobId: string;
  };
}

async function getJobListing(jobId: string) {
  return api.jobs.getListingById(jobId);
}

export default async function ChatPage({ params, searchParams }: ChatPageProps) {
  const jobListing = await getJobListing(searchParams.jobId);

  return (
    <div className="container mx-auto py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold mb-2">{jobListing.title}</h1>
        <p className="text-gray-600">{jobListing.department} • {jobListing.location}</p>
      </div>
      <AgentChat 
        candidateId={params.candidateId} 
        jobId={searchParams.jobId}
        agentFlow={jobListing.agentFlow}
      />
    </div>
  );
} 