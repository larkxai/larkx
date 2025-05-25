"use client"

import React from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { PlusCircle, GitBranch, Users, Clock, Eye, FileText, Zap } from "lucide-react"
import { api } from "@/lib/api"
import { JobListing } from "@/@types/jobListings"
import { Candidate } from "@/@types/candidates"
import Link from "next/link"

export default function HomePage() {
  const [recentJobs, setRecentJobs] = React.useState<JobListing[]>([]);
  const [recentCandidates, setRecentCandidates] = React.useState<Candidate[]>([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    const fetchData = async () => {
      try {
        const [jobs, candidates] = await Promise.all([
          api.jobs.getListings(),
          api.candidates.getAll()
        ]);
        setRecentJobs(jobs.slice(0, 3));
        setRecentCandidates(candidates.slice(0, 3));
      } catch (error) {
        console.error('Error fetching dashboard data:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  if (loading) {
    return <div>Loading...</div>;
  }

  return (
    <div className="container mx-auto p-6">
      <div>
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-2xl font-bold">Welcome to Larkx</h1>
            <p className="text-muted-foreground">
              Streamline your hiring process with our comprehensive workflow management system.
            </p>
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-6 mb-8">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <GitBranch className="h-5 w-5" />
                Create Agent Flow
              </CardTitle>
              <CardDescription>
                Design custom agent flows to automate your recruitment process.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground mb-4">
                Define stages, set requirements, and automate tasks with AI agents.
              </p>
              <Button asChild>
                <Link href="/app/jobs/flows/new">
                  <PlusCircle className="mr-2 h-4 w-4" />
                  Create New Flow
                </Link>
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Post a Job
              </CardTitle>
              <CardDescription>
                Create and publish job listings that integrate with your agent flows.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground mb-4">
                Reach the right candidates faster with integrated job posts.
              </p>
              <div className="space-x-3">
                <Button asChild>
                  <Link href="/app/jobs/listings/new">
                    <PlusCircle className="mr-2 h-4 w-4" />
                    Create Job Post
                  </Link>
                </Button>
                <Button variant="outline" asChild>
                  <Link href="/app/jobs/listings">
                    <Eye className="mr-2 h-4 w-4" />
                    View Posts
                  </Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Why Use Larkx?</CardTitle>
            <CardDescription>Discover the benefits of our platform</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid md:grid-cols-3 gap-6">
              <div>
                <h3 className="font-medium mb-2 flex items-center gap-2">
                  <Zap className="h-4 w-4" />
                  AI-Powered Agents
                </h3>
                <p className="text-sm text-muted-foreground">
                  Automate your hiring process with intelligent AI agents that handle screening and interviews.
                </p>
              </div>
              <div>
                <h3 className="font-medium mb-2 flex items-center gap-2">
                  <Users className="h-4 w-4" />
                  Candidate Management
                </h3>
                <p className="text-sm text-muted-foreground">
                  Keep track of candidates throughout the hiring process with our intuitive interface.
                </p>
              </div>
              <div>
                <h3 className="font-medium mb-2 flex items-center gap-2">
                  <Clock className="h-4 w-4" />
                  Time-Saving Features
                </h3>
                <p className="text-sm text-muted-foreground">
                  Reduce manual work and focus on what matters most - finding the right talent.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}