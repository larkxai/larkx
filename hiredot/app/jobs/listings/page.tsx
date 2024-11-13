"use client";

import { Card } from "@/components/ui/card";
import { publishedJobs } from "@/mocks/openings";
import { formatDistanceToNow } from "date-fns";
import { useState } from "react";

export default function PublishingPage() {
  const [platformFilter, setPlatformFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [sortColumn, setSortColumn] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");

  const filteredJobs = publishedJobs
    .filter(
      (job) => platformFilter === "all" || job.platform === platformFilter
    )
    .filter((job) => statusFilter === "all" || job.status === statusFilter)
    .sort((a, b) => {
      if (!sortColumn) return 0;

      const aValue = a[sortColumn as keyof typeof a];
      const bValue = b[sortColumn as keyof typeof b];

      if (typeof aValue === "string" && typeof bValue === "string") {
        return sortDirection === "asc"
          ? aValue.localeCompare(bValue)
          : bValue.localeCompare(aValue);
      }

      return sortDirection === "asc"
        ? Number(aValue) - Number(bValue)
        : Number(bValue) - Number(aValue);
    });

  const handleSort = (column: string) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortColumn(column);
      setSortDirection("asc");
    }
  };

  const platforms = Array.from(
    new Set(publishedJobs.map((job) => job.platform))
  );
  const statuses = Array.from(new Set(publishedJobs.map((job) => job.status)));

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
            <option key={platform} value={platform}>
              {platform}
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
                  <td className="p-4">{job.platform}</td>
                  <td className="p-4">{job.views}</td>
                  <td className="p-4">{job.applications}</td>
                  <td className="p-4">
                    <span className="px-2 py-1 bg-secondary text-secondary-foreground rounded-md text-sm">
                      {job.status}
                    </span>
                  </td>
                  <td className="p-4">
                    {formatDistanceToNow(job.publishedDate)} ago
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
