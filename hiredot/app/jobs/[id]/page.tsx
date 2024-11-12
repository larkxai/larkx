import React from 'react';

interface JobDetailsPageProps {
  params: {
    id: string;
  };
}

export default function JobDetailsPage({ params }: JobDetailsPageProps) {
  // This is a mock job data - in real app you'd fetch this from an API
  const mockJob = {
    id: params.id,
    title: "Senior Frontend Developer",
    department: "Engineering",
    location: "Remote",
    status: "Active",
    applicants: 45,
    description: "We are looking for an experienced Frontend Developer...",
    requirements: [
      "5+ years of experience with React",
      "Strong TypeScript skills",
      "Experience with Next.js",
    ],
  };

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4">{mockJob.title}</h1>
      
      <div className="grid grid-cols-2 gap-4 mb-6">
        <div className="bg-white p-4 rounded-lg shadow">
          <h2 className="font-semibold mb-2">Details</h2>
          <div className="space-y-2">
            <p>Department: {mockJob.department}</p>
            <p>Location: {mockJob.location}</p>
            <p>Status: {mockJob.status}</p>
            <p>Total Applicants: {mockJob.applicants}</p>
          </div>
        </div>
        
        <div className="bg-white p-4 rounded-lg shadow">
          <h2 className="font-semibold mb-2">Requirements</h2>
          <ul className="list-disc pl-4">
            {mockJob.requirements.map((req, index) => (
              <li key={index}>{req}</li>
            ))}
          </ul>
        </div>
      </div>

      <div className="bg-white p-4 rounded-lg shadow">
        <h2 className="font-semibold mb-2">Description</h2>
        <p>{mockJob.description}</p>
      </div>
    </div>
  );
} 