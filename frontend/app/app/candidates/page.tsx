"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { mockCandidates } from "@/mocks/candidates";
import { formatDistanceToNow } from "date-fns";
import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PlusIcon, X, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Candidate } from "@/@types/candidates";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export default function CandidatesPage() {
  const [searchTerm, setSearchTerm] = useState("");
  const [stageFilter, setStageFilter] = useState<"new" | "screening" | "interviewing" | "offered" | "hired" | "rejected" | "withdrawn" | "all">("all");
  const [selectedCandidate, setSelectedCandidate] = useState<Candidate | null>(null);

  const filteredCandidates = mockCandidates.filter((candidate) => {
    const matchesSearch =
      `${candidate.firstName} ${candidate.lastName}`
        .toLowerCase()
        .includes(searchTerm.toLowerCase()) ||
      candidate.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      candidate.currentRole.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesStage =
      stageFilter === "all" || candidate.status === stageFilter;

    return matchesSearch && matchesStage;
  });

  return (
    <div className="container mx-auto p-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold">Candidates</h1>
          <p className="text-muted-foreground">Track and manage your candidates</p>
        </div>
        <Button className="flex items-center gap-2">
          <PlusIcon className="w-4 h-4" />
          New Candidate
        </Button>
      </div>

      <div className="flex gap-4 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
          <Input
            placeholder="Search candidates..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
        <Select value={stageFilter} onValueChange={(value) => setStageFilter(value as typeof stageFilter)}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="All Stages" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Stages</SelectItem>
            <SelectItem value="new">New</SelectItem>
            <SelectItem value="screening">Screening</SelectItem>
            <SelectItem value="interviewing">Interviewing</SelectItem>
            <SelectItem value="offered">Offered</SelectItem>
            <SelectItem value="hired">Hired</SelectItem>
            <SelectItem value="rejected">Rejected</SelectItem>
            <SelectItem value="withdrawn">Withdrawn</SelectItem>
          </SelectContent>
        </Select>
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
                  <span className="font-medium">
                    {candidate.firstName} {candidate.lastName}
                  </span>
                  <span className="text-sm text-muted-foreground ml-4">
                    {candidate.currentRole}
                  </span>
                </div>
                <Badge
                  variant={
                    candidate.status === "hired"
                      ? "success"
                      : candidate.status === "rejected"
                      ? "destructive"
                      : candidate.status === "offered"
                      ? "default"
                      : "secondary"
                  }
                >
                  {candidate.status.charAt(0).toUpperCase() + candidate.status.slice(1)}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">Location</p>
                  <p>{candidate.location || "Not specified"}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Email</p>
                  <p className="truncate">{candidate.email}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Phone</p>
                  <p>{candidate.phoneNumber || "Not specified"}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Last Updated</p>
                  <p>{formatDistanceToNow(new Date(candidate.updatedAt))} ago</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Dialog
        open={!!selectedCandidate}
        onOpenChange={() => setSelectedCandidate(null)}
      >
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
                  <p className="text-muted-foreground">
                    {selectedCandidate.email}
                  </p>
                  {selectedCandidate.phoneNumber && (
                    <p className="text-muted-foreground">
                      {selectedCandidate.phoneNumber}
                    </p>
                  )}
                </div>
                <div>
                  <h4 className="font-medium">Current Role</h4>
                  <p>{selectedCandidate.currentRole || "Not specified"}</p>
                  <p className="text-sm text-muted-foreground">
                    {selectedCandidate.location || "Location not specified"}
                  </p>
                </div>
              </div>

              <div className="mb-6">
                <h4 className="font-medium mb-2">Application Status</h4>
                <div className="flex items-center gap-2">
                  <Badge
                    variant={
                      selectedCandidate.status === "hired"
                        ? "success"
                        : selectedCandidate.status === "rejected"
                        ? "destructive"
                        : selectedCandidate.status === "offered"
                        ? "default"
                        : "secondary"
                    }
                  >
                    {selectedCandidate.status.charAt(0).toUpperCase() + selectedCandidate.status.slice(1)}
                  </Badge>
                  <span className="text-sm text-muted-foreground">
                    Last updated {formatDistanceToNow(new Date(selectedCandidate.updatedAt))} ago
                  </span>
                </div>
              </div>

              <div className="mb-6">
                <h4 className="font-medium mb-2">Form Data</h4>
                <div className="space-y-2">
                  {Object.entries(selectedCandidate.formData).map(([agentId, data]) => (
                    <div key={agentId} className="border rounded-md p-3">
                      <p className="text-sm font-medium">{agentId}</p>
                      <p className="text-sm text-muted-foreground">
                        Submitted {formatDistanceToNow(new Date(data.timestamp))} ago
                      </p>
                      <p className="mt-1">{data.value}</p>
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
