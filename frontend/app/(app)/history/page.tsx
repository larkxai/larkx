"use client";

import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { History, Filter, Calendar, GitBranch, FileText, Image, Settings, AlertTriangle, CheckCircle, XCircle } from "lucide-react";
import Link from "next/link";
import androidIcon from "../../android.png";
import iosIcon from "../../ios.png";

// Event types for different activities
type EventType = "metadata_change" | "build_submitted" | "build_rejected" | "build_approved" | "screenshot_uploaded" | "credentials_updated" | "preflight_issue" | "app_created" | "app_deleted";

type EventSeverity = "info" | "success" | "warning" | "error";

interface HistoryEvent {
  id: string;
  timestamp: string;
  appId: string;
  appName: string;
  platform: "ios" | "android" | "both";
  eventType: EventType;
  severity: EventSeverity;
  title: string;
  description: string;
  details?: {
    field?: string;
    oldValue?: string;
    newValue?: string;
    buildNumber?: number;
    version?: string;
    rejectionReason?: string;
    issueType?: string;
  };
  user: string;
}

// Mock history events
const historyEvents: HistoryEvent[] = [
  {
    id: "evt_1",
    timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    appId: "app_shoply",
    appName: "Shoply",
    platform: "android",
    eventType: "metadata_change",
    severity: "info",
    title: "Android: Changed title",
    description: "App title updated from 'Shoply' to 'Shoply - Deals'",
    details: {
      field: "title",
      oldValue: "Shoply",
      newValue: "Shoply - Deals"
    },
    user: "Alex B"
  },
  {
    id: "evt_2",
    timestamp: new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString(),
    appId: "app_shoply",
    appName: "Shoply",
    platform: "android",
    eventType: "build_rejected",
    severity: "error",
    title: "Android: Build rejected",
    description: "Build #103 rejected - Guideline 2.1 – Metadata",
    details: {
      buildNumber: 103,
      version: "2.0.1",
      rejectionReason: "Guideline 2.1 – Metadata"
    },
    user: "System"
  },
  {
    id: "evt_3",
    timestamp: new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString(),
    appId: "app_travelly",
    appName: "Travelly",
    platform: "ios",
    eventType: "build_submitted",
    severity: "info",
    title: "iOS: New build submitted",
    description: "Build #61 submitted to TestFlight",
    details: {
      buildNumber: 61,
      version: "1.2.0"
    },
    user: "Alex B"
  },
  {
    id: "evt_4",
    timestamp: new Date(Date.now() - 8 * 60 * 60 * 1000).toISOString(),
    appId: "app_travelly",
    appName: "Travelly",
    platform: "android",
    eventType: "build_submitted",
    severity: "info",
    title: "Android: New build submitted",
    description: "Build #58 submitted to Google Play",
    details: {
      buildNumber: 58,
      version: "1.2.0"
    },
    user: "Alex B"
  },
  {
    id: "evt_5",
    timestamp: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
    appId: "app_notely",
    appName: "Notely",
    platform: "ios",
    eventType: "build_approved",
    severity: "success",
    title: "iOS: Build approved",
    description: "Build #1 approved and live on App Store",
    details: {
      buildNumber: 1,
      version: "1.0.0"
    },
    user: "System"
  },
  {
    id: "evt_6",
    timestamp: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
    appId: "app_travelly",
    appName: "Travelly",
    platform: "both",
    eventType: "screenshot_uploaded",
    severity: "info",
    title: "Screenshots uploaded",
    description: "Added iPhone 6.7\" screenshots for 3 locales",
    details: {
      field: "screenshots"
    },
    user: "Alex B"
  },
  {
    id: "evt_7",
    timestamp: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
    appId: "app_shoply",
    appName: "Shoply",
    platform: "ios",
    eventType: "preflight_issue",
    severity: "warning",
    title: "iOS: Preflight issue detected",
    description: "iPad landscape missing in 3 locales",
    details: {
      issueType: "missing_screenshots"
    },
    user: "System"
  },
  {
    id: "evt_8",
    timestamp: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
    appId: "app_fitloop",
    appName: "FitLoop",
    platform: "both",
    eventType: "credentials_updated",
    severity: "info",
    title: "Store credentials updated",
    description: "App Store Connect and Google Play credentials refreshed",
    user: "Alex B"
  },
  {
    id: "evt_9",
    timestamp: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
    appId: "app_habitsy",
    appName: "Habitsy",
    platform: "android",
    eventType: "app_created",
    severity: "info",
    title: "New app created",
    description: "Habitsy app added to dashboard",
    user: "Alex B"
  }
];

function EventIcon({ eventType, severity }: { eventType: EventType; severity: EventSeverity }) {
  const iconClass = `h-4 w-4 ${
    severity === "error" ? "text-red-400" :
    severity === "warning" ? "text-amber-400" :
    severity === "success" ? "text-emerald-400" :
    "text-slate-400"
  }`;

  switch (eventType) {
    case "metadata_change":
      return <FileText className={iconClass} />;
    case "build_submitted":
      return <GitBranch className={iconClass} />;
    case "build_rejected":
      return <XCircle className={iconClass} />;
    case "build_approved":
      return <CheckCircle className={iconClass} />;
    case "screenshot_uploaded":
      return <Image className={iconClass} />;
    case "credentials_updated":
      return <Settings className={iconClass} />;
    case "preflight_issue":
      return <AlertTriangle className={iconClass} />;
    case "app_created":
      return <History className={iconClass} />;
    default:
      return <History className={iconClass} />;
  }
}

function PlatformIcon({ platform }: { platform: "ios" | "android" | "both" }) {
  if (platform === "both") {
    return (
      <div className="flex gap-1">
        <img src={iosIcon.src} alt="iOS" className="h-3 w-3 object-contain" />
        <img src={androidIcon.src} alt="Android" className="h-3 w-3 object-contain" />
      </div>
    );
  }
  
  return (
    <img 
      src={platform === "ios" ? iosIcon.src : androidIcon.src} 
      alt={platform === "ios" ? "iOS" : "Android"} 
      className="h-3 w-3 object-contain" 
    />
  );
}

export default function HistoryPage() {
  const [query, setQuery] = React.useState("");
  const [selectedApp, setSelectedApp] = React.useState("all");
  const [selectedEventType, setSelectedEventType] = React.useState("all");
  const [selectedSeverity, setSelectedSeverity] = React.useState("all");

  // Get unique apps for filter
  const apps = React.useMemo(() => {
    const uniqueApps = Array.from(new Set(historyEvents.map(e => e.appName)));
    return uniqueApps.sort();
  }, []);

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

  const filtered = historyEvents.filter((event) => {
    const matchQuery = event.title.toLowerCase().includes(query.toLowerCase()) ||
                      event.description.toLowerCase().includes(query.toLowerCase());
    const matchApp = selectedApp === "all" || event.appName === selectedApp;
    const matchEventType = selectedEventType === "all" || event.eventType === selectedEventType;
    const matchSeverity = selectedSeverity === "all" || event.severity === selectedSeverity;
    
    return matchQuery && matchApp && matchEventType && matchSeverity;
  });

  const eventTypeOptions = [
    { value: "all", label: "All events" },
    { value: "metadata_change", label: "Metadata changes" },
    { value: "build_submitted", label: "Builds submitted" },
    { value: "build_rejected", label: "Builds rejected" },
    { value: "build_approved", label: "Builds approved" },
    { value: "screenshot_uploaded", label: "Screenshots" },
    { value: "credentials_updated", label: "Credentials" },
    { value: "preflight_issue", label: "Preflight issues" },
    { value: "app_created", label: "App created" }
  ];

  const severityOptions = [
    { value: "all", label: "All severities" },
    { value: "info", label: "Info" },
    { value: "success", label: "Success" },
    { value: "warning", label: "Warning" },
    { value: "error", label: "Error" }
  ];

  return (
    <main className="min-h-screen text-slate-100">
      <div className="w-full">
        <div className="p-6">
          <div className="mb-6">
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <History className="h-6 w-6" />
              Activity History
            </h1>
            <p className="text-slate-400">Track all changes and events across your apps</p>
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
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <div>
                  <label className="text-sm text-slate-300 mb-2 block">Search</label>
                  <Input
                    placeholder="Search events..."
                    className="bg-slate-900/60 border-white/10 placeholder:text-slate-500"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-sm text-slate-300 mb-2 block">App</label>
                  <select
                    className="w-full h-9 rounded-md border border-white/10 bg-slate-900/60 text-slate-100 text-sm px-3"
                    value={selectedApp}
                    onChange={(e) => setSelectedApp(e.target.value)}
                  >
                    <option value="all">All apps</option>
                    {apps.map((app) => (
                      <option key={app} value={app}>{app}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-sm text-slate-300 mb-2 block">Event Type</label>
                  <select
                    className="w-full h-9 rounded-md border border-white/10 bg-slate-900/60 text-slate-100 text-sm px-3"
                    value={selectedEventType}
                    onChange={(e) => setSelectedEventType(e.target.value)}
                  >
                    {eventTypeOptions.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-sm text-slate-300 mb-2 block">Severity</label>
                  <select
                    className="w-full h-9 rounded-md border border-white/10 bg-slate-900/60 text-slate-100 text-sm px-3"
                    value={selectedSeverity}
                    onChange={(e) => setSelectedSeverity(e.target.value)}
                  >
                    {severityOptions.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Events Timeline */}
          <Card className="rounded-2xl border-white/10 bg-slate-900/60 backdrop-blur">
            <CardHeader>
              <CardTitle className="text-slate-100 flex items-center gap-2">
                <Calendar className="h-5 w-5" />
                Recent Events ({filtered.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {filtered.map((event) => (
                  <div key={event.id} className="flex items-start gap-4 p-4 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 transition-colors">
                    <div className="flex-shrink-0 mt-1">
                      <EventIcon eventType={event.eventType} severity={event.severity} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm font-medium text-slate-100">{event.title}</span>
                        <PlatformIcon platform={event.platform} />
                        <Badge 
                          className={`text-xs ${
                            event.severity === "error" ? "bg-red-400/10 text-red-400 border-red-400/30" :
                            event.severity === "warning" ? "bg-amber-400/10 text-amber-400 border-amber-400/30" :
                            event.severity === "success" ? "bg-emerald-400/10 text-emerald-400 border-emerald-400/30" :
                            "bg-slate-400/10 text-slate-400 border-slate-400/30"
                          }`}
                        >
                          {event.severity}
                        </Badge>
                      </div>
                      <p className="text-sm text-slate-400 mb-2">{event.description}</p>
                      <div className="flex items-center gap-4 text-xs text-slate-500">
                        <span>{event.appName}</span>
                        <span>•</span>
                        <span>{event.user}</span>
                        <span>•</span>
                        <span>{relative(event.timestamp)}</span>
                        {event.details?.buildNumber && (
                          <>
                            <span>•</span>
                            <span>Build #{event.details.buildNumber}</span>
                          </>
                        )}
                      </div>
                    </div>
                    <div className="flex-shrink-0">
                      <Link 
                        href={`/apps/${event.appId}`}
                        className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
                      >
                        View App →
                      </Link>
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
