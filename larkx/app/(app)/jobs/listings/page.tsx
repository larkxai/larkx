"use client";

import { Card } from "@/components/ui/card";
import { formatDistanceToNow } from "date-fns";
import { useState, useEffect } from "react";
import { mockJobListings } from "@/mocks/jobListings";
import { JobListing, } from "@/@types/jobListings";

export default function PublishingPage() {
  // This should come from an API or props
  const [jobs, setJobs] = useState<JobListing[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [platformFilter, setPlatformFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [sortColumn, setSortColumn] = useState<keyof JobListing | null>(null);
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");

  useEffect(() => {
    // Simulate API call with loading state
    setIsLoading(true);
    try {
      setJobs(mockJobListings);
    } catch (err) {
      console.error(err);
      setError("Failed to load job listings");
    } finally {
      setIsLoading(false);
    }
  }, []); // Empty dependency array - run once on mount

  const filteredJobs = jobs
    .filter(
      (job) => platformFilter === "all" || job.platform.id === platformFilter
    )
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

  // Get unique platforms and statuses from actual data
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
          <h1 className="text-2xl font-bold">Openings</h1>
          <p className="text-muted-foreground">Track your job openings</p>
        </div>
      </div>

      <div className="flex gap-4 mb-4">
        <select
          className="px-4 py-2 border rounded-md"
          value={platformFilter}
          onChange={(e) => setPlatformFilter(e.target.value)}
        >
          <option value="all">All Platforms</option>
          {platforms.map((platform) => (
            <option key={platform.id} value={platform.id}>
              {platform.name}
            </option>
          ))}
        </select>

        <select
          className="px-4 py-2 border rounded-md"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          <option value="all">All Statuses</option>
          {statuses.map((status) => (
            <option key={status} value={status}>
              {status}
            </option>
          ))}
        </select>
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
                  <th
                    className="text-left p-4 text-sm font-medium text-muted-foreground cursor-pointer hover:bg-gray-50"
                    onClick={() => handleSort("title")}
                  >
                    Job Title{" "}
                    {sortColumn === "title" &&
                      (sortDirection === "asc" ? "↑" : "↓")}
                  </th>
                  <th
                    className="text-left p-4 text-sm font-medium text-muted-foreground cursor-pointer hover:bg-gray-50"
                    onClick={() => handleSort("platform")}
                  >
                    Platform{" "}
                    {sortColumn === "platform" &&
                      (sortDirection === "asc" ? "↑" : "↓")}
                  </th>
                  <th
                    className="text-left p-4 text-sm font-medium text-muted-foreground cursor-pointer hover:bg-gray-50"
                    onClick={() => handleSort("views")}
                  >
                    Views{" "}
                    {sortColumn === "views" &&
                      (sortDirection === "asc" ? "↑" : "↓")}
                  </th>
                  <th
                    className="text-left p-4 text-sm font-medium text-muted-foreground cursor-pointer hover:bg-gray-50"
                    onClick={() => handleSort("applications")}
                  >
                    Applications{" "}
                    {sortColumn === "applications" &&
                      (sortDirection === "asc" ? "↑" : "↓")}
                  </th>
                  <th
                    className="text-left p-4 text-sm font-medium text-muted-foreground cursor-pointer hover:bg-gray-50"
                    onClick={() => handleSort("status")}
                  >
                    Status{" "}
                    {sortColumn === "status" &&
                      (sortDirection === "asc" ? "↑" : "↓")}
                  </th>
                  <th
                    className="text-left p-4 text-sm font-medium text-muted-foreground cursor-pointer hover:bg-gray-50"
                    onClick={() => handleSort("publishedDate")}
                  >
                    Published{" "}
                    {sortColumn === "publishedDate" &&
                      (sortDirection === "asc" ? "↑" : "↓")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredJobs.map((job) => (
                  <tr key={job.id} className="border-b">
                    <td className="p-4">{job.title}</td>
                    <td className="p-4">{job.platform.name}</td>
                    <td className="p-4">{job.views ?? 0}</td>
                    <td className="p-4">{job.applications ?? 0}</td>
                    <td className="p-4">
                      <span
                        className={`px-2 py-1 rounded-md text-sm ${
                          job.status === "active"
                            ? "bg-green-100 text-green-800"
                            : job.status === "paused"
                            ? "bg-yellow-100 text-yellow-800"
                            : "bg-gray-100 text-gray-800"
                        }`}
                      >
                        {job.status}
                      </span>
                    </td>
                    <td className="p-4">
                      {job.publishedDate ? `${formatDistanceToNow(new Date(job.publishedDate))} ago` : 'Not published'}
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
