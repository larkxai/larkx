"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import {
  Bar,
  BarChart,
  Line,
  LineChart,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from "recharts";
import { CalendarIcon, GlobeIcon, ExternalLinkIcon } from "lucide-react";

const publishingData = [
  { month: "Jan", corporateWebsite: 15, indeed: 10, totalApplications: 300 },
  { month: "Feb", corporateWebsite: 18, indeed: 12, totalApplications: 350 },
  { month: "Mar", corporateWebsite: 20, indeed: 15, totalApplications: 400 },
  { month: "Apr", corporateWebsite: 22, indeed: 18, totalApplications: 450 },
  { month: "May", corporateWebsite: 25, indeed: 20, totalApplications: 500 },
  { month: "Jun", corporateWebsite: 28, indeed: 22, totalApplications: 550 },
];

const applicationSourceData = [
  { source: "Corporate Website", applications: 2000, percentage: "60%" },
  { source: "Indeed", applications: 1300, percentage: "39%" },
  { source: "Other", applications: 50, percentage: "1%" },
];

const topPerformingJobs = [
  {
    title: "Software Engineer",
    applications: 250,
    views: 1500,
    conversionRate: "16.7%",
  },
  {
    title: "Product Manager",
    applications: 180,
    views: 1200,
    conversionRate: "15.0%",
  },
  {
    title: "Data Analyst",
    applications: 150,
    views: 1000,
    conversionRate: "15.0%",
  },
  {
    title: "UX Designer",
    applications: 120,
    views: 900,
    conversionRate: "13.3%",
  },
  {
    title: "Sales Representative",
    applications: 100,
    views: 800,
    conversionRate: "12.5%",
  },
];

export default function ReportsPage() {
  const [dateRange, setDateRange] = useState("last6months");

  return (
    <div className="container mx-auto p-6 space-y-8">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">Reports & KPIs</h1>
        <div className="flex items-center space-x-2">
          <CalendarIcon className="w-5 h-5 text-gray-500" />
          <Select value={dateRange} onValueChange={setDateRange}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Select date range" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="last30days">Last 30 days</SelectItem>
              <SelectItem value="last3months">Last 3 months</SelectItem>
              <SelectItem value="last6months">Last 6 months</SelectItem>
              <SelectItem value="lastyear">Last year</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Total Job Postings
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">128</div>
            <p className="text-xs text-muted-foreground">
              +15% from last period
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Total Applications
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">2,550</div>
            <p className="text-xs text-muted-foreground">
              +20.1% from last period
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Avg. Applications per Posting
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">19.9</div>
            <p className="text-xs text-muted-foreground">
              +5% from last period
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Job Postings by Platform</CardTitle>
          </CardHeader>
          <CardContent>
            <ChartContainer
              config={{
                corporateWebsite: {
                  label: "Corporate Website",
                  color: "hsl(var(--chart-1))",
                },
                indeed: {
                  label: "Indeed",
                  color: "hsl(var(--chart-2))",
                },
              }}
              className="h-[300px]"
            >
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={publishingData}>
                  <XAxis dataKey="month" />
                  <YAxis />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Bar
                    dataKey="corporateWebsite"
                    fill="var(--color-corporateWebsite)"
                  />
                  <Bar dataKey="indeed" fill="var(--color-indeed)" />
                </BarChart>
              </ResponsiveContainer>
            </ChartContainer>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Total Applications Over Time</CardTitle>
          </CardHeader>
          <CardContent>
            <ChartContainer
              config={{
                totalApplications: {
                  label: "Total Applications",
                  color: "hsl(var(--chart-1))",
                },
              }}
              className="h-[300px]"
            >
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={publishingData}>
                  <XAxis dataKey="month" />
                  <YAxis />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Line
                    type="monotone"
                    dataKey="totalApplications"
                    stroke="var(--color-totalApplications)"
                    strokeWidth={2}
                  />
                </LineChart>
              </ResponsiveContainer>
            </ChartContainer>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Application Sources</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Source</TableHead>
                <TableHead>Applications</TableHead>
                <TableHead>Percentage</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {applicationSourceData.map((source) => (
                <TableRow key={source.source}>
                  <TableCell className="flex items-center">
                    {source.source === "Corporate Website" ? (
                      <GlobeIcon className="mr-2 h-4 w-4" />
                    ) : source.source === "Indeed" ? (
                      <ExternalLinkIcon className="mr-2 h-4 w-4" />
                    ) : null}
                    {source.source}
                  </TableCell>
                  <TableCell>{source.applications}</TableCell>
                  <TableCell>{source.percentage}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Top Performing Job Postings</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Job Title</TableHead>
                <TableHead>Applications</TableHead>
                <TableHead>Views</TableHead>
                <TableHead>Conversion Rate</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {topPerformingJobs.map((job) => (
                <TableRow key={job.title}>
                  <TableCell>{job.title}</TableCell>
                  <TableCell>{job.applications}</TableCell>
                  <TableCell>{job.views}</TableCell>
                  <TableCell>{job.conversionRate}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
