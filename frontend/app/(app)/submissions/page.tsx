"use client";

import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Rocket, Filter, Clock, CheckCircle, XCircle, AlertTriangle, Eye } from "lucide-react";
import Link from "next/link";
import androidIcon from "../../android.png";
import iosIcon from "../../ios.png";

// Submission status types
type SubmissionStatus = "draft" | "submitted" | "in_review" | "approved" | "rejected" | "live" | "cancelled";

interface Submission {
  id: string;
  appId: string;
  appName: string;
  platform: "ios" | "android";
  version: string;
  buildNumber: number;
  status: SubmissionStatus;
  submittedAt: string;
  reviewedAt?: string;
  liveAt?: string;
  rejectionReason?: string;
  reviewer?: string;
  track: "production" | "internal" | "testflight" | "beta";
  metadata: {
    title: string;
    description: string;
    keywords: string;
    screenshots: number;
    locales: number;
  };
  progress: {
    step: number;
    totalSteps: number;
    currentStep: string;
  };
}

// Mock submissions data
const submissions: Submission[] = [
  {
    id: "sub_1",
    appId: "app_travelly",
    appName: "Travelly",
    platform: "ios",
    version: "1.2.0",
    buildNumber: 61,
    status: "in_review",
    submittedAt: new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString(),
    track: "testflight",
    metadata: {
      title: "Travelly",
      description: "Discover amazing places and plan your perfect trip",
      keywords: "travel,booking,hotels,flights",
      screenshots: 9,
      locales: 6
    },
    progress: {
      step: 2,
      totalSteps: 4,
      currentStep: "Under Review"
    }
  },
  {
    id: "sub_2",
    appId: "app_shoply",
    appName: "Shoply",
    platform: "android",
    version: "2.0.1",
    buildNumber: 103,
    status: "rejected",
    submittedAt: new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString(),
    reviewedAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    rejectionReason: "Guideline 2.1 – Metadata. Your app title contains promotional text.",
    reviewer: "Google Play Review Team",
    track: "production",
    metadata: {
      title: "Shoply - Deals",
      description: "Shop smart, save more with exclusive deals",
      keywords: "shopping,deals,discounts",
      screenshots: 6,
      locales: 10
    },
    progress: {
      step: 3,
      totalSteps: 4,
      currentStep: "Rejected"
    }
  },
  {
    id: "sub_3",
    appId: "app_notely",
    appName: "Notely",
    platform: "ios",
    version: "1.0.0",
    buildNumber: 1,
    status: "live",
    submittedAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    reviewedAt: new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString(),
    liveAt: new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString(),
    reviewer: "App Store Review Team",
    track: "production",
    metadata: {
      title: "Notely",
      description: "Simple and elegant note-taking app",
      keywords: "notes,productivity,writing",
      screenshots: 5,
      locales: 2
    },
    progress: {
      step: 4,
      totalSteps: 4,
      currentStep: "Live"
    }
  },
  {
    id: "sub_4",
    appId: "app_fitloop",
    appName: "FitLoop",
    platform: "android",
    version: "1.1.0",
    buildNumber: 33,
    status: "in_review",
    submittedAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    track: "production",
    metadata: {
      title: "FitLoop",
      description: "Track your fitness journey with AI-powered insights",
      keywords: "fitness,workout,health",
      screenshots: 8,
      locales: 4
    },
    progress: {
      step: 2,
      totalSteps: 4,
      currentStep: "Under Review"
    }
  },
  {
    id: "sub_5",
    appId: "app_habitsy",
    appName: "Habitsy",
    platform: "ios",
    version: "0.8.0",
    buildNumber: 11,
    status: "draft",
    submittedAt: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString(),
    track: "testflight",
    metadata: {
      title: "Habitsy",
      description: "Build better habits with smart tracking",
      keywords: "habits,productivity,tracking",
      screenshots: 3,
      locales: 1
    },
    progress: {
      step: 1,
      totalSteps: 4,
      currentStep: "Draft"
    }
  },
  {
    id: "sub_6",
    appId: "app_shoply",
    appName: "Shoply",
    platform: "ios",
    version: "2.0.0",
    buildNumber: 100,
    status: "in_review",
    submittedAt: new Date(Date.now() - 8 * 60 * 60 * 1000).toISOString(),
    track: "production",
    metadata: {
      title: "Shoply",
      description: "Discover great deals and save money",
      keywords: "shopping,deals,savings",
      screenshots: 7,
      locales: 8
    },
    progress: {
      step: 2,
      totalSteps: 4,
      currentStep: "Under Review"
    }
  }
];

function StatusBadge({ status }: { status: SubmissionStatus }) {
  const statusConfig = {
    draft: { color: "text-slate-400 border-white/10 bg-white/5", label: "Draft" },
    submitted: { color: "text-indigo-400 border-indigo-400/30 bg-indigo-400/10", label: "Submitted" },
    in_review: { color: "text-blue-400 border-blue-400/30 bg-blue-400/10", label: "In Review" },
    approved: { color: "text-emerald-400 border-emerald-400/30 bg-emerald-400/10", label: "Approved" },
    rejected: { color: "text-red-400 border-red-400/30 bg-red-400/10", label: "Rejected" },
    live: { color: "text-emerald-400 border-emerald-400/30 bg-emerald-400/10", label: "Live" },
    cancelled: { color: "text-slate-400 border-white/10 bg-white/5", label: "Cancelled" }
  };

  const config = statusConfig[status];
  return (
    <Badge className={`text-xs ${config.color}`}>
      {config.label}
    </Badge>
  );
}

function StatusIcon({ status }: { status: SubmissionStatus }) {
  const iconClass = "h-4 w-4";
  
  switch (status) {
    case "draft":
      return <Clock className={`${iconClass} text-slate-400`} />;
    case "submitted":
      return <Rocket className={`${iconClass} text-indigo-400`} />;
    case "in_review":
      return <Eye className={`${iconClass} text-blue-400`} />;
    case "approved":
      return <CheckCircle className={`${iconClass} text-emerald-400`} />;
    case "rejected":
      return <XCircle className={`${iconClass} text-red-400`} />;
    case "live":
      return <CheckCircle className={`${iconClass} text-emerald-400`} />;
    case "cancelled":
      return <XCircle className={`${iconClass} text-slate-400`} />;
    default:
      return <Clock className={`${iconClass} text-slate-400`} />;
  }
}

function ProgressBar({ step, totalSteps }: { step: number; totalSteps: number }) {
  const percentage = (step / totalSteps) * 100;
  
  return (
    <div className="w-full bg-slate-800 rounded-full h-2">
      <div 
        className="bg-indigo-400 h-2 rounded-full transition-all duration-300"
        style={{ width: `${percentage}%` }}
      />
    </div>
  );
}

export default function SubmissionsPage() {
  const [query, setQuery] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState("all");
  const [platformFilter, setPlatformFilter] = React.useState("all");

  const relative = (iso: string) => {
    const diff = Date.now() - new Date(iso).getTime();
    const m = Math.floor(diff / 60000);
    if (m < 1) return "just now";
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    const d = Math.floor(h / 24);
    return `${d}d ago`;
  };

  const filtered = submissions.filter((submission) => {
    const matchQuery = submission.appName.toLowerCase().includes(query.toLowerCase()) ||
                      submission.version.toLowerCase().includes(query.toLowerCase());
    const matchStatus = statusFilter === "all" || submission.status === statusFilter;
    const matchPlatform = platformFilter === "all" || submission.platform === platformFilter;
    
    return matchQuery && matchStatus && matchPlatform;
  });

  const stats = {
    total: submissions.length,
    inReview: submissions.filter(s => s.status === "in_review").length,
    rejected: submissions.filter(s => s.status === "rejected").length,
    live: submissions.filter(s => s.status === "live").length,
    draft: submissions.filter(s => s.status === "draft").length
  };

  return (
    <main className="min-h-screen text-slate-100">
      <div className="w-full">
        <div className="p-6">
          <div className="mb-6">
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Rocket className="h-6 w-6" />
              Submissions
            </h1>
            <p className="text-slate-400">Track your app store submissions and review status</p>
          </div>

          {/* Stats Cards */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
            <Card className="rounded-2xl border-white/10 bg-slate-900/60 backdrop-blur">
              <CardContent className="p-4">
                <div className="text-2xl font-bold text-slate-100">{stats.total}</div>
                <div className="text-sm text-slate-400">Total</div>
              </CardContent>
            </Card>
            <Card className="rounded-2xl border-white/10 bg-slate-900/60 backdrop-blur">
              <CardContent className="p-4">
                <div className="text-2xl font-bold text-blue-400">{stats.inReview}</div>
                <div className="text-sm text-slate-400">In Review</div>
              </CardContent>
            </Card>
            <Card className="rounded-2xl border-white/10 bg-slate-900/60 backdrop-blur">
              <CardContent className="p-4">
                <div className="text-2xl font-bold text-red-400">{stats.rejected}</div>
                <div className="text-sm text-slate-400">Rejected</div>
              </CardContent>
            </Card>
            <Card className="rounded-2xl border-white/10 bg-slate-900/60 backdrop-blur">
              <CardContent className="p-4">
                <div className="text-2xl font-bold text-emerald-400">{stats.live}</div>
                <div className="text-sm text-slate-400">Live</div>
              </CardContent>
            </Card>
            <Card className="rounded-2xl border-white/10 bg-slate-900/60 backdrop-blur">
              <CardContent className="p-4">
                <div className="text-2xl font-bold text-slate-400">{stats.draft}</div>
                <div className="text-sm text-slate-400">Draft</div>
              </CardContent>
            </Card>
          </div>

          {/* Filters */}
          <Card className="rounded-2xl border-white/10 bg-slate-900/60 backdrop-blur mb-6">
            <CardHeader>
              <CardTitle className="text-slate-100 flex items-center gap-2">
                <Filter className="h-5 w-5" />
                Filters
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="text-sm text-slate-300 mb-2 block">Search</label>
                  <Input
                    placeholder="Search submissions..."
                    className="bg-slate-900/60 border-white/10 placeholder:text-slate-500"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-sm text-slate-300 mb-2 block">Status</label>
                  <select
                    className="w-full h-9 rounded-md border border-white/10 bg-slate-900/60 text-slate-100 text-sm px-3"
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                  >
                    <option value="all">All statuses</option>
                    <option value="draft">Draft</option>
                    <option value="submitted">Submitted</option>
                    <option value="in_review">In Review</option>
                    <option value="approved">Approved</option>
                    <option value="rejected">Rejected</option>
                    <option value="live">Live</option>
                    <option value="cancelled">Cancelled</option>
                  </select>
                </div>
                <div>
                  <label className="text-sm text-slate-300 mb-2 block">Platform</label>
                  <select
                    className="w-full h-9 rounded-md border border-white/10 bg-slate-900/60 text-slate-100 text-sm px-3"
                    value={platformFilter}
                    onChange={(e) => setPlatformFilter(e.target.value)}
                  >
                    <option value="all">All platforms</option>
                    <option value="ios">iOS</option>
                    <option value="android">Android</option>
                  </select>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Submissions Table */}
          <Card className="rounded-2xl border-white/10 bg-slate-900/60 backdrop-blur">
            <CardHeader>
              <CardTitle className="text-slate-100">Submissions ({filtered.length})</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {filtered.map((submission) => (
                  <div key={submission.id} className="p-4 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 transition-colors">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <img 
                          src={submission.platform === "ios" ? iosIcon.src : androidIcon.src} 
                          alt={submission.platform === "ios" ? "iOS" : "Android"} 
                          className="h-5 w-5 object-contain" 
                        />
                        <div>
                          <h3 className="font-medium text-slate-100">{submission.appName}</h3>
                          <p className="text-sm text-slate-400">
                            {submission.platform === "ios" ? "iOS" : "Android"} • v{submission.version} (Build #{submission.buildNumber})
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <StatusIcon status={submission.status} />
                        <StatusBadge status={submission.status} />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-3">
                      <div>
                        <div className="text-xs text-slate-400 mb-1">Track</div>
                        <div className="text-sm text-slate-200 capitalize">{submission.track}</div>
                      </div>
                      <div>
                        <div className="text-xs text-slate-400 mb-1">Submitted</div>
                        <div className="text-sm text-slate-200">{relative(submission.submittedAt)}</div>
                      </div>
                      <div>
                        <div className="text-xs text-slate-400 mb-1">Progress</div>
                        <div className="text-sm text-slate-200">
                          {submission.progress.step}/{submission.progress.totalSteps} - {submission.progress.currentStep}
                        </div>
                      </div>
                    </div>

                    <div className="mb-3">
                      <ProgressBar step={submission.progress.step} totalSteps={submission.progress.totalSteps} />
                    </div>

                    {submission.rejectionReason && (
                      <div className="p-3 rounded-lg bg-red-400/10 border border-red-400/30 mb-3">
                        <div className="flex items-start gap-2">
                          <AlertTriangle className="h-4 w-4 text-red-400 mt-0.5 flex-shrink-0" />
                          <div>
                            <div className="text-sm font-medium text-red-400 mb-1">Rejection Reason</div>
                            <div className="text-sm text-slate-300">{submission.rejectionReason}</div>
                            {submission.reviewer && (
                              <div className="text-xs text-slate-400 mt-1">Reviewed by: {submission.reviewer}</div>
                            )}
                          </div>
                        </div>
                      </div>
                    )}

                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4 text-xs text-slate-400">
                        <span>{submission.metadata.screenshots} screenshots</span>
                        <span>•</span>
                        <span>{submission.metadata.locales} locales</span>
                        {submission.reviewedAt && (
                          <>
                            <span>•</span>
                            <span>Reviewed {relative(submission.reviewedAt)}</span>
                          </>
                        )}
                        {submission.liveAt && (
                          <>
                            <span>•</span>
                            <span>Live {relative(submission.liveAt)}</span>
                          </>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <Link href={`/apps/${submission.appId}`}>
                          <Button variant="outline" size="sm" className="border-white/10 bg-white/5 text-slate-300 hover:bg-white/10">
                            View App
                          </Button>
                        </Link>
                        {submission.status === "rejected" && (
                          <Button size="sm" className="bg-indigo-500 hover:bg-indigo-600 text-white">
                            Fix Issues
                          </Button>
                        )}
                        {submission.status === "draft" && (
                          <Button size="sm" className="bg-emerald-500 hover:bg-emerald-600 text-white">
                            Submit
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </main>
  );
}
