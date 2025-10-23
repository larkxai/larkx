"use client";

import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
// Using a native <select> to avoid any runtime issues with the Select component while we iterate on UX

import androidIcon from "../../android.png";
import iosIcon from "../../ios.png";


// Inline mocks and types while we iterate on UI/UX
type StoreStatus = "live" | "in_review" | "rejected" | "draft" | "preview" | "approved";
type DistributionTrack = "production" | "internal" | "testflight";
interface PlatformInfo {
  version: string;
  build: number;
  status: StoreStatus;
  track?: DistributionTrack;
  lastSubmissionAt?: string;
  // UI-only context for iteration
  rejectReason?: string; // short code or text
  rejectAt?: string; // ISO
  missingScreenshots?: string; // e.g., "iPad landscape: 3 locales"
}
interface AppMock {
  id: string;
  name: string;
  iconUrl?: string;
  packageIdAndroid?: string;
  bundleIdIos?: string;
  android?: PlatformInfo;
  ios?: PlatformInfo;
  locales: number;
  screenshotsComplete: boolean;
  rejectionCount: number;
  updatedAt: string;
}

const apps: AppMock[] = [
  {
    id: "app_travelly",
    name: "Travelly",
    android: { version: "1.2.0", build: 58, status: "in_review", track: "production", lastSubmissionAt: new Date(Date.now()-2*60*60*1000).toISOString() },
    ios: { version: "1.2.0", build: 61, status: "preview", track: "testflight", lastSubmissionAt: new Date(Date.now()-6*60*60*1000).toISOString() },
    locales: 6,
    screenshotsComplete: true,
    rejectionCount: 0,
    updatedAt: new Date(Date.now()-30*60*1000).toISOString(),
  },
  {
    id: "app_shoply",
    name: "Shoply",
    android: { version: "2.0.1", build: 103, status: "rejected", track: "production", lastSubmissionAt: new Date(Date.now()-4*60*60*1000).toISOString(), rejectReason: "Guideline 2.1 – Metadata", rejectAt: new Date(Date.now()-4*60*60*1000).toISOString() },
    ios: { version: "2.0.0", build: 100, status: "in_review", track: "production", lastSubmissionAt: new Date(Date.now()-8*60*60*1000).toISOString(), missingScreenshots: "iPad landscape missing in 3 locales" },
    locales: 10,
    screenshotsComplete: false,
    rejectionCount: 2,
    updatedAt: new Date(Date.now()-90*60*1000).toISOString(),
  },
  {
    id: "app_notely",
    name: "Notely",
    android: { version: "0.9.5", build: 21, status: "draft", track: "internal" },
    ios: { version: "1.0.0", build: 1, status: "approved", track: "production", lastSubmissionAt: new Date(Date.now()-24*60*60*1000).toISOString() },
    locales: 2,
    screenshotsComplete: true,
    rejectionCount: 0,
    updatedAt: new Date(Date.now()-120*60*1000).toISOString(),
  },
  {
    id: "app_fitloop",
    name: "FitLoop",
    android: { version: "1.1.0", build: 33, status: "approved", track: "production" },
    ios: { version: "1.1.0", build: 35, status: "in_review", track: "production" },
    locales: 4,
    screenshotsComplete: true,
    rejectionCount: 1,
    updatedAt: new Date(Date.now()-15*60*1000).toISOString(),
  },
  {
    id: "app_habitsy",
    name: "Habitsy",
    android: { version: "0.8.0", build: 12, status: "preview", track: "internal", missingScreenshots: "2 Android portraits" },
    ios: { version: "0.8.0", build: 11, status: "preview", track: "testflight" },
    locales: 1,
    screenshotsComplete: false,
    rejectionCount: 0,
    updatedAt: new Date(Date.now()-240*60*1000).toISOString(),
  },
];

function StatusBadge({ status }: { status: StoreStatus }) {
  const map: Record<StoreStatus, string> = {
    approved: "text-emerald-400 border-emerald-400/30 bg-emerald-400/10",
    live: "text-emerald-400 border-emerald-400/30 bg-emerald-400/10",
    in_review: "text-indigo-400 border-indigo-400/30 bg-indigo-400/10",
    rejected: "text-pink-400 border-pink-400/30 bg-red-400/10",
    draft: "text-slate-400 border-white/10 bg-white/5",
    preview: "text-blue-400 border-blue-400/30 bg-blue-400/10",
  } as const;
  return (
    <span className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs ${map[status]}`}>
      {status}
    </span>
  );
}

function PlatformRow({ icon, p }: { icon: React.ReactNode; p?: AppMock["android"] }) {
  if (!p) return (
    <div className="flex items-center justify-between text-sm text-slate-500">
      <span className="text-slate-400 flex items-center gap-2">{icon}</span>
      <span className="text-slate-500">—</span>
    </div>
  );
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-slate-300 flex items-center gap-2">{icon} <span className="text-slate-200 font-medium">{p.version}</span></span>
      <div className="flex items-center gap-2">
        <StatusBadge status={p.status} />
        {p.track && (
          <span className="text-xs text-slate-400">· {p.track}</span>
        )}
      </div>
    </div>
  );
}

export default function AppsPage() {
  const [query, setQuery] = React.useState("");
  const [status, setStatus] = React.useState<string>("all");
  const router = useRouter();

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

  const filtered = apps.filter((a) => {
    const matchName = a.name.toLowerCase().includes(query.toLowerCase());
    const statuses: StoreStatus[] = [a.android?.status as StoreStatus, a.ios?.status as StoreStatus].filter(Boolean) as StoreStatus[];
    const matchStatus = status === "all" || statuses.includes(status as StoreStatus);
    return matchName && matchStatus;
  });

  const agg = {
    inReview: apps.filter(a => a.android?.status === "in_review" || a.ios?.status === "in_review").length,
    rejected: apps.filter(a => a.android?.status === "rejected" || a.ios?.status === "rejected").length,
    locales: apps.reduce((sum, a) => sum + a.locales, 0),
  };

  const borderFor = (a: AppMock) => {
    const statuses: StoreStatus[] = [a.android?.status as StoreStatus, a.ios?.status as StoreStatus].filter(Boolean) as StoreStatus[];
    if (statuses.includes("rejected")) return "border-pink-400/40 shadow-[0_0_0_1px_rgba(244,114,182,0.35)]";
    if (statuses.includes("preview") || statuses.includes("draft")) return "border-amber-400/40 shadow-[0_0_0_1px_rgba(251,191,36,0.25)]";
    if (statuses.includes("in_review")) return "border-indigo-400/40 shadow-[0_0_0_1px_rgba(129,140,248,0.35)]";
    if (statuses.includes("approved") || statuses.includes("live")) return "border-white/10 opacity-90";
    return "border-white/10";
  };
  // Urgency score for sorting (higher first)
  const score = (a: AppMock) => {
    const s = [a.android?.status, a.ios?.status] as (StoreStatus | undefined)[];
    const hasRejected = s.includes("rejected");
    const hasIncomplete = s.includes("preview") || s.includes("draft");
    const hasReview = s.includes("in_review");
    let sc = 0;
    if (hasRejected) sc += 100;
    if (hasIncomplete) sc += 60;
    if (hasReview) sc += 30;
    return sc + (Date.now() - new Date(a.updatedAt).getTime()) / -1e7; // newer slightly higher
  };

  const [sort, setSort] = React.useState("urgency");
  const sorted = [...filtered].sort((a,b)=>{
    if (sort === "updated") return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    if (sort === "name") return a.name.localeCompare(b.name);
    return score(b) - score(a);
  });

  const actionFor = (p?: PlatformInfo): { label: string; intent: "primary" | "neutral" | "danger" } | null => {
    if (!p) return null;
    if (p.status === "rejected") return { label: "Fix rejection", intent: "danger" };
    if (p.status === "in_review") return { label: "View status", intent: "neutral" };
    if (p.status === "preview" || p.status === "draft") return { label: "Submit", intent: "primary" };
    if (p.status === "approved" || p.status === "live") return { label: "View release", intent: "neutral" };
    return { label: "View", intent: "neutral" };
  };

  const actionClass = (intent: "primary" | "neutral" | "danger") =>
    intent === "danger"
      ? "bg-red-500 text-white hover:bg-red-600"
      : intent === "primary"
      ? "bg-indigo-500 text-white hover:bg-indigo-600"
      : "bg-white/10 text-slate-300 hover:bg-white/15";
  return (
    <main className="min-h-screen text-slate-100">
      <div className="w-full">
        <div className="p-6">
          <div className="mb-6 flex items-center justify-between">
            <div>
            <h1 className="text-2xl font-bold">All Apps</h1>
            <p className="text-slate-400">Overview of apps across iOS and Android</p>
          </div>
          <Link href="/apps/new">
            <Button className="bg-indigo-500 hover:bg-indigo-600 text-white">
              <Plus className="h-4 w-4 mr-2" />
              Add App
            </Button>
          </Link>
        </div>

        {/* Controls + aggregates */}
        <div className="mb-6 flex flex-col md:flex-row gap-3 md:items-center md:justify-between">
          <div className="flex gap-3 items-center">
            <Input
              placeholder="Search apps"
              className="w-64 bg-slate-900/60 border-white/10 placeholder:text-slate-500"
              value={query}
              onChange={(e)=>setQuery(e.target.value)}
            />
            <select
              className="w-44 h-9 rounded-md border border-white/10 bg-slate-900/60 text-slate-100 text-sm px-3"
              value={status}
              onChange={(e)=>setStatus(e.target.value)}
            >
              <option value="all">All statuses</option>
              <option value="in_review">In review</option>
              <option value="approved">Approved</option>
              <option value="live">Live</option>
              <option value="rejected">Rejected</option>
              <option value="preview">Preview</option>
              <option value="draft">Draft</option>
            </select>
            <select
              className="w-40 h-9 rounded-md border border-white/10 bg-slate-900/60 text-slate-100 text-sm px-3"
              value={sort}
              onChange={(e)=>setSort(e.target.value)}
            >
              <option value="urgency">Sort: Urgency</option>
              <option value="updated">Sort: Updated</option>
              <option value="name">Sort: Name</option>
            </select>
          </div>
          <div className="flex gap-4 text-sm text-slate-300">
            <span><span className="text-indigo-400 font-medium">{agg.inReview}</span> in review</span>
            <span><span className="text-pink-400 font-medium">{agg.rejected}</span> rejected</span>
            <span><span className="text-slate-100 font-medium">{agg.locales}</span> locales</span>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {sorted.map((app) => (
            <Card 
              key={app.id} 
              className={`relative rounded-2xl bg-slate-900/60 backdrop-blur ${borderFor(app)} cursor-pointer hover:bg-slate-800/60 transition-colors`}
              onClick={() => router.push(`/apps/${app.id}`)}
            >
              <CardHeader>
                <CardTitle className="flex items-center justify-between text-slate-100 text-base">
                  <span className="truncate flex items-center gap-2">
                    {/* alert dot when any action is needed */}
                    { (app.android?.status === 'rejected' || app.ios?.status === 'rejected' || app.android?.status === 'preview' || app.ios?.status === 'preview' || app.android?.status === 'draft' || app.ios?.status === 'draft') && (
                      <span className="inline-block h-2 w-2 rounded-full bg-red-400" />
                    )}
                    {app.name}
                  </span>
                  <div className="flex items-center gap-2">
                    {!app.screenshotsComplete && (
                      <Badge className="bg-amber-500/20 text-amber-300 border-amber-400/30" title={app.android?.missingScreenshots || app.ios?.missingScreenshots || ''}>Screenshots incomplete</Badge>
                    )}
                  </div>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <PlatformRow
                  icon={
                    <img
                      src={androidIcon.src}
                      alt="Android"
                      className="h-4 w-4 text-green-400 object-contain"
                      style={{ display: "inline-block" }}
                    />
                  }
                  p={app.android}
                />
                <PlatformRow
                  icon={
                    <img
                      src={iosIcon.src}
                      alt="iOS"
                      className="h-4 w-4 text-slate-200 object-contain"
                      style={{ display: "inline-block" }}
                    />
                  }
                  p={app.ios}
                />

                <div className="mt-2 grid grid-cols-3 gap-2 text-xs text-slate-400">
                  <div className="rounded-md border border-white/10 bg-white/5 p-2">
                    <div className="text-slate-300">Locales</div>
                    <div className="text-slate-200 font-medium">{app.locales}</div>
                  </div>
                  {/* Per-platform actions focused on release flow */}
                  <div className="rounded-md border border-white/10 bg-white/5 p-2 flex items-center justify-between">
                    <div />
                    {(() => {
                      const a = actionFor(app.ios);
                      return a ? (
                        <button className={`inline-flex items-center gap-2 rounded-md px-2.5 py-1 ${actionClass(a.intent)}`}>
                          <img
                            src={iosIcon.src}
                            alt="iOS"
                            className="h-3.5 w-3.5 object-contain"
                            style={{ display: "inline-block" }}
                          />{" "}
                          {a.label}
                        </button>
                      ) : null;
                    })()}
                  </div>
                  <div className="rounded-md border border-white/10 bg-white/5 p-2 flex items-center justify-between">
                    <div />
                    {(() => {
                      const a = actionFor(app.android);
                      return a ? (
                        <button className={`inline-flex items-center gap-2 rounded-md px-2.5 py-1 ${actionClass(a.intent)}`}>
                          <img
                            src={androidIcon.src}
                            alt="Android"
                            className="h-3.5 w-3.5 object-contain"
                            style={{ display: "inline-block" }}
                          />{" "}
                          {a.label}
                        </button>
                      ) : null;
                    })()}
                  </div>
                </div>

                <div className="mt-3 flex items-center justify-between text-xs text-slate-500">
                  <span>Updated {relative(app.updatedAt)}</span>
                  <span />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
        </div>
      </div>
    </main>
  );
}

