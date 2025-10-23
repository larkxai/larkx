"use client";

import React from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export default function HomePage() {
  // lightweight mocks to render dashboard; swap with real data later
  const submissions = [
    { id: "sub_1", app: "Travelly", platform: "iOS", status: "in_review", updatedAt: "2h ago" },
    { id: "sub_2", app: "Shoply", platform: "Android", status: "rejected", updatedAt: "4h ago" },
    { id: "sub_3", app: "Notely", platform: "iOS", status: "approved", updatedAt: "1d ago" },
  ];
  const preflightIssues = [
    { id: "pf_1", app: "Shoply", type: "Privacy strings", severity: "high" },
    { id: "pf_2", app: "Travelly", type: "Screenshot sizes", severity: "medium" },
  ];
  const credentials = [
    { provider: "App Store Connect", status: "connected" },
    { provider: "Google Play", status: "missing" },
  ];
  return (
    <main className="min-h-screen text-slate-100">
      <div className="w-full">
        <div className="p-6">
          <div className="flex justify-between items-center mb-6">
            <div>
              <h1 className="text-2xl font-bold text-slate-100">Welcome to Larkx</h1>
              <p className="text-slate-400">Manage your app store submissions and track progress</p>
            </div>
          </div>

        {/* Quick stats */}
        <div className="grid md:grid-cols-3 gap-6 mt-8">
          <Card className="rounded-2xl border-white/10 bg-slate-900/60 backdrop-blur">
            <CardHeader>
              <CardTitle className="text-slate-100 text-base">Submissions in review</CardTitle>
              <CardDescription className="text-slate-400">Currently awaiting review</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-4xl font-semibold text-indigo-400">{submissions.filter(s=>s.status==="in_review").length}</div>
            </CardContent>
          </Card>
          <Card className="rounded-2xl border-white/10 bg-slate-900/60 backdrop-blur">
            <CardHeader>
              <CardTitle className="text-slate-100 text-base">Rejections</CardTitle>
              <CardDescription className="text-slate-400">Need attention</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-4xl font-semibold text-pink-400">{submissions.filter(s=>s.status==="rejected").length}</div>
            </CardContent>
          </Card>
          <Card className="rounded-2xl border-white/10 bg-slate-900/60 backdrop-blur">
            <CardHeader>
              <CardTitle className="text-slate-100 text-base">Connected stores</CardTitle>
              <CardDescription className="text-slate-400">Credentials status</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-4xl font-semibold text-emerald-400">{credentials.filter(c=>c.status==="connected").length}/2</div>
            </CardContent>
          </Card>
        </div>

        {/* Recent submissions */}
        <Card className="rounded-2xl border-white/10 bg-slate-900/60 backdrop-blur mt-8">
          <CardHeader>
            <CardTitle className="text-slate-100">Recent submissions</CardTitle>
            <CardDescription className="text-slate-400">Latest activity across your apps</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-slate-300">App</TableHead>
                  <TableHead className="text-slate-300">Platform</TableHead>
                  <TableHead className="text-slate-300">Status</TableHead>
                  <TableHead className="text-slate-300">Updated</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {submissions.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="text-slate-200">{s.app}</TableCell>
                    <TableCell className="text-slate-400">{s.platform}</TableCell>
                    <TableCell className="text-slate-200">
                      {s.status === "approved" && <span className="text-emerald-400">approved</span>}
                      {s.status === "rejected" && <span className="text-pink-400">rejected</span>}
                      {s.status === "in_review" && <span className="text-indigo-400">in_review</span>}
                    </TableCell>
                    <TableCell className="text-slate-400">{s.updatedAt}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Preflight issues */}
        <Card className="rounded-2xl border-white/10 bg-slate-900/60 backdrop-blur mt-8">
          <CardHeader>
            <CardTitle className="text-slate-100">Preflight issues</CardTitle>
            <CardDescription className="text-slate-400">Fix before submitting</CardDescription>
          </CardHeader>
          <CardContent>
            {preflightIssues.length === 0 ? (
              <p className="text-slate-400 text-sm">All good!</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {preflightIssues.map((i) => (
                  <li key={i.id} className="flex items-center justify-between rounded-xl border border-white/10 bg-slate-800/50 px-3 py-2">
                    <span className="text-slate-200">{i.app} — {i.type}</span>
                    <span className={i.severity === "high" ? "text-pink-400" : "text-amber-300"}>{i.severity}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
    </main>
  );
}
