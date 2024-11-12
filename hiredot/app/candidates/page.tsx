"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { mockCandidates } from "@/mocks/candidates";
import { formatDistanceToNow, format } from "date-fns";
import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export default function CandidatesPage() {
  const [searchTerm, setSearchTerm] = useState("");
  const [stageFilter, setStageFilter] = useState<string>("all");
  const [selectedCandidate, setSelectedCandidate] = useState<typeof mockCandidates[0] | null>(null);

  const filteredCandidates = mockCandidates.filter((candidate) => {
    const matchesSearch = 
      `${candidate.firstName} ${candidate.lastName}`
        .toLowerCase()
        .includes(searchTerm.toLowerCase()) ||
      candidate.tags.some(tag => 
        tag.toLowerCase().includes(searchTerm.toLowerCase())
      );

    const matchesStage = 
      stageFilter === "all" || candidate.currentStage === stageFilter;

    return matchesSearch && matchesStage;
  });

  return (
    <div className="container mx-auto p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Candidates</h1>
        <div className="flex gap-4">
          <input
            type="text"
            placeholder="Search candidates..."
            className="px-4 py-2 border rounded-md"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
          <select
            className="px-4 py-2 border rounded-md"
            value={stageFilter}
            onChange={(e) => setStageFilter(e.target.value)}
          >
            <option value="all">All Stages</option>
            <option value="New">New</option>
            <option value="Screening">Screening</option>
            <option value="Interview">Interview</option>
            <option value="Technical Test">Technical Test</option>
            <option value="Offer">Offer</option>
            <option value="Hired">Hired</option>
            <option value="Rejected">Rejected</option>
          </select>
        </div>
      </div>

      <div className="grid gap-4">
        {filteredCandidates.map((candidate) => (
          <Card 
            key={candidate.id} 
            className="hover:shadow-lg transition-shadow cursor-pointer"
            onClick={() => setSelectedCandidate(candidate)}
          >
            <CardHeader>
              <CardTitle className="flex justify-between items-center">
                <div>
                  <span>{candidate.firstName} {candidate.lastName}</span>
                  <span className="text-sm text-muted-foreground ml-4">
                    {candidate.job.title}
                  </span>
                </div>
                <span className={`text-sm px-3 py-1 rounded-full ${
                  {
                    'New': 'bg-blue-100 text-blue-800',
                    'Screening': 'bg-yellow-100 text-yellow-800',
                    'Interview': 'bg-purple-100 text-purple-800',
                    'Technical Test': 'bg-orange-100 text-orange-800',
                    'Offer': 'bg-green-100 text-green-800',
                    'Hired': 'bg-emerald-100 text-emerald-800',
                    'Rejected': 'bg-red-100 text-red-800',
                  }[candidate.currentStage]
                }`}>
                  {candidate.currentStage}
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">Job Details</p>
                  <p>{candidate.job.department} • {candidate.job.location}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Source</p>
                  <p>{candidate.source}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Applied</p>
                  <p>{formatDistanceToNow(candidate.createdAt)} ago</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Tags</p>
                  <div className="flex flex-wrap gap-2 mt-1">
                    {candidate.tags.map((tag) => (
                      <span
                        key={tag}
                        className="px-2 py-1 bg-secondary text-secondary-foreground rounded-md text-sm"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Dialog open={!!selectedCandidate} onOpenChange={() => setSelectedCandidate(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Candidate Details</DialogTitle>
          </DialogHeader>
          {selectedCandidate && (
            <div className="mt-4">
              <div className="grid grid-cols-2 gap-4 mb-6">
                <div>
                  <h3 className="font-semibold text-lg">
                    {selectedCandidate.firstName} {selectedCandidate.lastName}
                  </h3>
                  <p className="text-muted-foreground">{selectedCandidate.email}</p>
                  {selectedCandidate.phone && (
                    <p className="text-muted-foreground">{selectedCandidate.phone}</p>
                  )}
                </div>
                <div>
                  <h4 className="font-medium">Applied Position</h4>
                  <p>{selectedCandidate.job.title}</p>
                  <p className="text-sm text-muted-foreground">
                    {selectedCandidate.job.department} • {selectedCandidate.job.location}
                  </p>
                </div>
              </div>

              <div className="mb-6">
                <h4 className="font-medium mb-2">Tags</h4>
                <div className="flex flex-wrap gap-2">
                  {selectedCandidate.tags.map((tag) => (
                    <span
                      key={tag}
                      className="px-2 py-1 bg-secondary text-secondary-foreground rounded-md text-sm"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>

              <div>
                <h4 className="font-medium mb-2">Candidate History</h4>
                <div className="space-y-4">
                  {selectedCandidate.history.map((entry) => (
                    <div key={entry.id} className="border-l-2 pl-4 pb-4">
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="font-medium">{entry.title}</p>
                          <p className="text-sm text-muted-foreground">
                            {entry.description}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm text-muted-foreground">
                            {format(entry.date, 'MMM d, yyyy')}
                          </p>
                          <p className="text-sm">{entry.author}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
} 