"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { PlusCircle, GitBranch, Users, Clock, Bell, Eye, FileText, Zap, Briefcase, UserPlus } from "lucide-react"
import { mockJobListings } from "@/mocks/jobListings"
import { mockCandidates } from "@/mocks/candidates"
import { formatDistanceToNow } from "date-fns"

export default function HomePage() {
  // Get recent job listings and candidates
  const recentJobs = mockJobListings.slice(0, 3);
  const recentCandidates = mockCandidates.slice(0, 3);

  // Mock notifications data
  const notifications = [
    {
      id: 1,
      title: "New application received", 
      description: "Sarah Miller applied for Senior Developer position",
      time: "2 hours ago"
    },
    {
      id: 2,
      title: "Interview scheduled",
      description: "Technical interview with John Doe at 2:00 PM",
      time: "5 hours ago"
    }
  ];

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
                Create Workflow
              </CardTitle>
              <CardDescription>
                Design custom hiring workflows to standardize your recruitment process.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground mb-4">
                Define stages, set requirements, and automate tasks.
              </p>
              <Button>
                <PlusCircle className="mr-2 h-4 w-4" />
                Create New Workflow
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
                Create and publish job listings that integrate with your workflows.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground mb-4">
                Reach the right candidates faster with integrated job posts.
              </p>
              <div className="space-x-3">
                <Button>
                  <PlusCircle className="mr-2 h-4 w-4" />
                  Create Job Post
                </Button>
                <Button variant="outline">
                  <Eye className="mr-2 h-4 w-4" />
                  View Posts
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid md:grid-cols-2 gap-6 mb-8">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Briefcase className="h-5 w-5" />
                Recent Job Listings
              </CardTitle>
              <CardDescription>Latest job openings in your organization</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {recentJobs.map((job) => (
                  <div key={job.id} className="flex items-start gap-4 p-3 rounded-lg hover:bg-accent">
                    <div className="flex-1">
                      <h3 className="font-medium">{job.title}</h3>
                      <p className="text-muted-foreground text-sm">{job.department}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-xs text-muted-foreground">
                          {job.views} views
                        </span>
                        <span className="text-xs text-muted-foreground">•</span>
                        <span className="text-xs text-muted-foreground">
                          {job.applications} applications
                        </span>
                      </div>
                    </div>
                    <Button variant="ghost" size="sm">
                      <Eye className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <UserPlus className="h-5 w-5" />
                Recent Candidates
              </CardTitle>
              <CardDescription>Latest candidates in your pipeline</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {recentCandidates.map((candidate) => (
                  <div key={candidate.id} className="flex items-start gap-4 p-3 rounded-lg hover:bg-accent">
                    <div className="flex-1">
                      <h3 className="font-medium">
                        {candidate.firstName} {candidate.lastName}
                      </h3>
                      <p className="text-muted-foreground text-sm">{candidate.currentRole}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-xs text-muted-foreground">
                          {candidate.status}
                        </span>
                        <span className="text-xs text-muted-foreground">•</span>
                        <span className="text-xs text-muted-foreground">
                          Updated {formatDistanceToNow(new Date(candidate.updatedAt))} ago
                        </span>
                      </div>
                    </div>
                    <Button variant="ghost" size="sm">
                      <Eye className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="mb-8">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Bell className="h-5 w-5" />
                Recent Notifications
              </CardTitle>
              <CardDescription>Stay updated with your recruitment activities</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {notifications.map((notification) => (
                  <div key={notification.id} className="flex items-start gap-4 p-3 rounded-lg hover:bg-accent">
                    <div className="h-2 w-2 mt-2 rounded-full bg-blue-500" />
                    <div>
                      <h3 className="font-medium">{notification.title}</h3>
                      <p className="text-muted-foreground text-sm">{notification.description}</p>
                      <span className="text-xs text-muted-foreground">{notification.time}</span>
                    </div>
                  </div>
                ))}
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
                  Streamlined Process
                </h3>
                <p className="text-muted-foreground text-sm">
                  Automate and organize your entire hiring workflow in one place
                </p>
              </div>
              <div>
                <h3 className="font-medium mb-2 flex items-center gap-2">
                  <Users className="h-4 w-4" />
                  Better Collaboration
                </h3>
                <p className="text-muted-foreground text-sm">
                  Keep your team aligned with shared workflows and real-time updates
                </p>
              </div>
              <div>
                <h3 className="font-medium mb-2 flex items-center gap-2">
                  <Clock className="h-4 w-4" />
                  Time Saving
                </h3>
                <p className="text-muted-foreground text-sm">
                  Reduce manual tasks and focus on finding the best candidates
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}