"use client";

import { Card } from "@/components/ui/card";
import { formatDistanceToNow } from "date-fns";
import { useState, useEffect } from "react";
import { JobListing } from "@/@types/jobListings";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, Plus } from "lucide-react";

export default function PublishingPage() {
  const [jobs, setJobs] = useState<JobListing[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const [platformFilter, setPlatformFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [sortColumn, setSortColumn] = useState<keyof JobListing | null>(null);
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");

  useEffect(() => {
    const fetchJobs = async () => {
      setIsLoading(true);
      try {
        const response = await fetch('http://localhost:3000/jobs/listings');
        if (!response.ok) {
          throw new Error('Failed to fetch job listings');
        }
        const data = await response.json();
        setJobs(data);
      } catch (err) {
        console.error(err);
        setError("Failed to load job listings");
      } finally {
        setIsLoading(false);
      }
    };

    fetchJobs();
  }, []);

  const filteredJobs = jobs
    .filter((job) => 
      job.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      job.department.toLowerCase().includes(searchQuery.toLowerCase())
    )
    .filter((job) => platformFilter === "all" || job.platform.id === platformFilter)
    .filter((job) => statusFilter === "all" || job.status === statusFilter)
    .sort((a, b) => {
      if (!sortColumn) return 0;

      const aValue = a[sortColumn];
      const bValue = b[sortColumn];

      if (typeof aValue === "string" && typeof bValue === "string") {
        return sortDirection === "asc"
          ? aValue.localeCompare(bValue)
          : bValue.localeCompare(aValue);
      }

      return sortDirection === "asc"
        ? Number(aValue) - Number(bValue)
        : Number(bValue) - Number(aValue);
    });

  const handleSort = (column: keyof JobListing) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortColumn(column);
      setSortDirection("asc");
    }
  };

  const platforms = Array.from(new Set(jobs.map((job) => job.platform)));
  const statuses = Array.from(new Set(jobs.map((job) => job.status)));

  if (isLoading) {
    return (
      <div className="container mx-auto p-6">
        <div className="flex items-center justify-center h-64">
          <div className="text-muted-foreground">Loading...</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mx-auto p-6">
        <div className="flex items-center justify-center h-64">
          <div className="text-destructive">{error}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold">Job Openings</h1>
          <p className="text-muted-foreground">Manage and track your job listings</p>
        </div>
        <Button className="flex items-center gap-2">
          <Plus className="w-4 h-4" />
          New Job
        </Button>
      </div>

      <div className="flex flex-col gap-4 mb-6">
        <div className="flex gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
            <Input
              placeholder="Search jobs..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
          <Select value={platformFilter} onValueChange={setPlatformFilter}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="All Platforms" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Platforms</SelectItem>
              {platforms.map((platform) => (
                <SelectItem key={platform.id} value={platform.id}>
                  {platform.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="All Statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              {statuses.map((status) => (
                <SelectItem key={status} value={status}>
                  {status}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <Card>
        <div className="overflow-x-auto">
          {jobs.length === 0 ? (
            <div className="flex items-center justify-center h-64">
              <div className="text-muted-foreground">No jobs found</div>
            </div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b">
                  <th className="text-left p-4 text-sm font-medium text-muted-foreground cursor-pointer hover:bg-gray-50" onClick={() => handleSort("title")}>
                    Job Title {sortColumn === "title" && (sortDirection === "asc" ? "↑" : "↓")}
                  </th>
                  <th className="text-left p-4 text-sm font-medium text-muted-foreground cursor-pointer hover:bg-gray-50" onClick={() => handleSort("department")}>
                    Department {sortColumn === "department" && (sortDirection === "asc" ? "↑" : "↓")}
                  </th>
                  <th className="text-left p-4 text-sm font-medium text-muted-foreground cursor-pointer hover:bg-gray-50" onClick={() => handleSort("platform")}>
                    Platform {sortColumn === "platform" && (sortDirection === "asc" ? "↑" : "↓")}
                  </th>
                  <th className="text-left p-4 text-sm font-medium text-muted-foreground cursor-pointer hover:bg-gray-50" onClick={() => handleSort("views")}>
                    Views {sortColumn === "views" && (sortDirection === "asc" ? "↑" : "↓")}
                  </th>
                  <th className="text-left p-4 text-sm font-medium text-muted-foreground cursor-pointer hover:bg-gray-50" onClick={() => handleSort("applications")}>
                    Applications {sortColumn === "applications" && (sortDirection === "asc" ? "↑" : "↓")}
                  </th>
                  <th className="text-left p-4 text-sm font-medium text-muted-foreground cursor-pointer hover:bg-gray-50" onClick={() => handleSort("status")}>
                    Status {sortColumn === "status" && (sortDirection === "asc" ? "↑" : "↓")}
                  </th>
                  <th className="text-left p-4 text-sm font-medium text-muted-foreground cursor-pointer hover:bg-gray-50" onClick={() => handleSort("publishedDate")}>
                    Published {sortColumn === "publishedDate" && (sortDirection === "asc" ? "↑" : "↓")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredJobs.map((job) => (
                  <tr key={job.id} className="border-b hover:bg-gray-50">
                    <td className="p-4">
                      <div className="font-medium">{job.title}</div>
                      <div className="text-sm text-muted-foreground">{job.location}</div>
                    </td>
                    <td className="p-4">{job.department}</td>
                    <td className="p-4">{job.platform.name}</td>
                    <td className="p-4">{job.views ?? 0}</td>
                    <td className="p-4">{job.applications ?? 0}</td>
                    <td className="p-4">
                      <Badge
                        variant={
                          job.status === "active"
                            ? "default"
                            : job.status === "paused"
                            ? "secondary"
                            : "outline"
                        }
                      >
                        {job.status}
                      </Badge>
                    </td>
                    <td className="p-4">
                      {job.publishedDate
                        ? `${formatDistanceToNow(new Date(job.publishedDate))} ago`
                        : "Not published"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </Card>
    </div>
  );
}
