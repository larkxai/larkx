"use client";

import React from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
// Using a native <select> to avoid any runtime issues with the Select component while we iterate on UX
import { Smartphone, Apple } from "lucide-react";

// Inline mocks and types while we iterate on UI/UX
type StoreStatus = "live" | "in_review" | "rejected" | "draft" | "preview" | "approved";
type DistributionTrack = "production" | "internal" | "testflight";
interface PlatformInfo {
  version: string;
  build: number;
  status: StoreStatus;
  track?: DistributionTrack;
  lastSubmissionAt?: string;
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
  credentials: { appStoreConnect: "connected" | "missing"; googlePlay: "connected" | "missing" };
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
    credentials: { appStoreConnect: "connected", googlePlay: "connected" },
    rejectionCount: 0,
    updatedAt: new Date(Date.now()-30*60*1000).toISOString(),
  },
  {
    id: "app_shoply",
    name: "Shoply",
    android: { version: "2.0.1", build: 103, status: "rejected", track: "production", lastSubmissionAt: new Date(Date.now()-4*60*60*1000).toISOString() },
    ios: { version: "2.0.0", build: 100, status: "in_review", track: "production", lastSubmissionAt: new Date(Date.now()-8*60*60*1000).toISOString() },
    locales: 10,
    screenshotsComplete: false,
    credentials: { appStoreConnect: "connected", googlePlay: "connected" },
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
    credentials: { appStoreConnect: "connected", googlePlay: "missing" },
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
    credentials: { appStoreConnect: "connected", googlePlay: "connected" },
    rejectionCount: 1,
    updatedAt: new Date(Date.now()-15*60*1000).toISOString(),
  },
  {
    id: "app_habitsy",
    name: "Habitsy",
    android: { version: "0.8.0", build: 12, status: "preview", track: "internal" },
    ios: { version: "0.8.0", build: 11, status: "preview", track: "testflight" },
    locales: 1,
    screenshotsComplete: false,
    credentials: { appStoreConnect: "missing", googlePlay: "connected" },
    rejectionCount: 0,
    updatedAt: new Date(Date.now()-240*60*1000).toISOString(),
  },
];

function StatusBadge({ status }: { status: StoreStatus }) {
  const map: Record<StoreStatus, string> = {
    approved: "text-emerald-400 border-emerald-400/30 bg-emerald-400/10",
    live: "text-emerald-400 border-emerald-400/30 bg-emerald-400/10",
    in_review: "text-indigo-400 border-indigo-400/30 bg-indigo-400/10",
    rejected: "text-pink-400 border-pink-400/30 bg-pink-400/10",
    draft: "text-slate-400 border-white/10 bg-white/5",
    preview: "text-blue-400 border-blue-400/30 bg-blue-400/10",
  } as any;
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
        {p.track && (
          <span className="rounded-md border border-white/10 bg-white/5 px-2 py-0.5 text-xs text-slate-400">{p.track}</span>
        )}
        <StatusBadge status={p.status} />
      </div>
    </div>
  );
}

export default function AppsPage() {
  const [query, setQuery] = React.useState("");
  const [status, setStatus] = React.useState<string>("all");

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
    if (statuses.includes("in_review")) return "border-indigo-400/40 shadow-[0_0_0_1px_rgba(129,140,248,0.35)]";
    if (statuses.includes("approved") || statuses.includes("live")) return "border-emerald-400/40 shadow-[0_0_0_1px_rgba(52,211,153,0.25)]";
    return "border-white/10";
  };
  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-930 to-slate-900 text-slate-100">
      <div className="container mx-auto p-6">
        <div className="mb-6">
          <h1 className="text-2xl font-bold">All Apps</h1>
          <p className="text-slate-400">Overview of apps across iOS and Android</p>
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
          </div>
          <div className="flex gap-4 text-sm text-slate-300">
            <span><span className="text-indigo-400 font-medium">{agg.inReview}</span> in review</span>
            <span><span className="text-pink-400 font-medium">{agg.rejected}</span> rejected</span>
            <span><span className="text-slate-100 font-medium">{agg.locales}</span> locales</span>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {filtered.map((app) => (
            <Card key={app.id} className={`rounded-2xl bg-slate-900/60 backdrop-blur ${borderFor(app)}`}>
              <CardHeader>
                <CardTitle className="flex items-center justify-between text-slate-100 text-base">
                  <span className="truncate">{app.name}</span>
                  <div className="flex items-center gap-2">
                    {app.rejectionCount > 0 && (
                      <Badge className="bg-pink-500/20 text-pink-300 border-pink-400/30">{app.rejectionCount} rejection{app.rejectionCount>1?"s":""}</Badge>
                    )}
                    {!app.screenshotsComplete && (
                      <Badge className="bg-amber-500/20 text-amber-300 border-amber-400/30">Screenshots</Badge>
                    )}
                  </div>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <PlatformRow icon={<Smartphone className="h-4 w-4 text-green-400" />} p={app.android} />
                <PlatformRow icon={<Apple className="h-4 w-4 text-slate-200" />} p={app.ios} />

                <div className="mt-2 grid grid-cols-3 gap-2 text-xs text-slate-400">
                  <div className="rounded-md border border-white/10 bg-white/5 p-2">
                    <div className="text-slate-300">Locales</div>
                    <div className="text-slate-200 font-medium">{app.locales}</div>
                  </div>
                  <div className="rounded-md border border-white/10 bg-white/5 p-2 flex items-center justify-between">
                    <span className="flex items-center gap-2 text-slate-300"><Apple className="h-3.5 w-3.5" /> ASC</span>
                    <span className={app.credentials.appStoreConnect === "connected" ? "text-emerald-400" : "text-slate-400"}>
                      {app.credentials.appStoreConnect}
                    </span>
                  </div>
                  <div className="rounded-md border border-white/10 bg-white/5 p-2 flex items-center justify-between">
                    <span className="flex items-center gap-2 text-slate-300"><Smartphone className="h-3.5 w-3.5" /> Play</span>
                    <span className={app.credentials.googlePlay === "connected" ? "text-emerald-400" : "text-slate-400"}>
                      {app.credentials.googlePlay}
                    </span>
                  </div>
                </div>

                <div className="mt-3 flex items-center justify-between text-xs text-slate-500">
                  <span>Updated {relative(app.updatedAt)}</span>
                  <Link href={`/app/apps/${app.id}`} className="rounded-md border border-white/10 bg-white/5 px-2 py-1 text-slate-300 hover:bg-white/10">
                    Open
                  </Link>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </main>
  );
}


