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
import { mockReports } from "@/mocks/reports";

export default function ReportsPage() {
  const [dateRange, setDateRange] = useState("last6months");

  // Transform mockReports data for charts
  const hiringMetricsReport = mockReports.find(r => r.type === "hiring_metrics");
  const pipelineReport = mockReports.find(r => r.type === "candidate_pipeline");
  const sourceReport = mockReports.find(r => r.type === "source_effectiveness");

  const chartData = [
    { month: "Jan", applications: hiringMetricsReport?.metrics[0].value || 0 },
    { month: "Feb", applications: hiringMetricsReport?.metrics[0].value || 0 },
    { month: "Mar", applications: hiringMetricsReport?.metrics[0].value || 0 },
    { month: "Apr", applications: hiringMetricsReport?.metrics[0].value || 0 },
    { month: "May", applications: hiringMetricsReport?.metrics[0].value || 0 },
    { month: "Jun", applications: hiringMetricsReport?.metrics[0].value || 0 }
  ];

  const applicationSources = [
    {
      source: "LinkedIn",
      applications: sourceReport?.metrics[0].value || 0,
      percentage: sourceReport?.metrics[0].value ? "35%" : "0%"
    },
    {
      source: "Corporate Website",
      applications: sourceReport?.metrics[0].value || 0,
      percentage: sourceReport?.metrics[0].value ? "30%" : "0%"
    },
    {
      source: "Indeed", 
      applications: sourceReport?.metrics[0].value || 0,
      percentage: sourceReport?.metrics[0].value ? "25%" : "0%"
    },
    {
      source: "Referrals",
      applications: sourceReport?.metrics[0].value || 0,
      percentage: sourceReport?.metrics[0].value ? "10%" : "0%"
    }
  ];

  const topJobs = mockReports
    .filter(r => r.type === "time_to_hire")
    .map(report => ({
      title: report.filters.jobRole || "",
      applications: report.metrics[0].value || 0,
      views: report.metrics[1].value || 0,
      conversionRate: `${((Number(report.metrics[0].value) / Number(report.metrics[1].value)) * 100).toFixed(1)}%`
    }));

  return (
    <div className="container mx-auto p-6 space-y-8">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold">Reports & KPIs</h1>
          <p className="text-muted-foreground">
            Track your reports and key performance indicators
          </p>
        </div>
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
              Total Applications
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{hiringMetricsReport?.metrics[0].value || 0}</div>
            <p className="text-xs text-muted-foreground">
              +{hiringMetricsReport?.metrics[0].change || 0}% from last period
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Time to Hire
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{hiringMetricsReport?.metrics[1].value}</div>
            <p className="text-xs text-muted-foreground">
              {hiringMetricsReport?.metrics[1].change}% from last period
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Candidates in Pipeline
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{pipelineReport?.metrics[0].value}</div>
            <p className="text-xs text-muted-foreground">
              +{pipelineReport?.metrics[0].change}% from last period
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Applications Over Time</CardTitle>
          </CardHeader>
          <CardContent>
            <ChartContainer
              config={{
                applications: {
                  label: "Applications",
                  color: "hsl(var(--chart-1))",
                },
              }}
              className="h-[300px]"
            >
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData}>
                  <XAxis dataKey="month" />
                  <YAxis />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Bar
                    dataKey="applications"
                    fill="var(--color-applications)"
                  />
                </BarChart>
              </ResponsiveContainer>
            </ChartContainer>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Time to Hire Trend</CardTitle>
          </CardHeader>
          <CardContent>
            <ChartContainer
              config={{
                timeToHire: {
                  label: "Days to Hire",
                  color: "hsl(var(--chart-1))",
                },
              }}
              className="h-[300px]"
            >
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData}>
                  <XAxis dataKey="month" />
                  <YAxis />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Line
                    type="monotone"
                    dataKey="applications"
                    stroke="var(--color-timeToHire)"
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
              {applicationSources.map((source) => (
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
              {topJobs.map((job) => (
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
