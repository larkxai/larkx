"use client";

import React from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  PlusCircle,
  GitBranch,
  Users,
  Clock,
  Eye,
  FileText,
  Zap,
} from "lucide-react";

import Link from "next/link";

export default function HomePage() {
  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-930 to-slate-900 text-slate-100">
      <div className="container mx-auto p-6">
        <div>
          <div className="flex justify-between items-center mb-6">
            <div>
              <h1 className="text-2xl font-bold text-slate-100">Welcome to Larkx</h1>
              <p className="text-slate-400">bla bla bla</p>
            </div>
          </div>

        <div className="grid md:grid-cols-2 gap-6 mb-8">
          <Card className="rounded-2xl border-white/10 bg-slate-900/60 backdrop-blur">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-slate-100">
                <GitBranch className="h-5 w-5" />
              </CardTitle>
              <CardDescription className="text-slate-400">bla bla bla</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-slate-300 mb-4">bla bla bla</p>
              <Button asChild className="rounded-xl bg-indigo-500 hover:bg-indigo-600">
                <Link href="/app/bla-bla/new">
                  <PlusCircle className="mr-2 h-4 w-4" />
                </Link>
              </Button>
            </CardContent>
          </Card>

          <Card className="rounded-2xl border-white/10 bg-slate-900/60 backdrop-blur">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-slate-100">
                <FileText className="h-5 w-5" />
              </CardTitle>
              <CardDescription className="text-slate-400">bla bla bla</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-slate-300 mb-4">bla bla bla</p>
              <div className="space-x-3">
                <Button asChild className="rounded-xl bg-indigo-500 hover:bg-indigo-600">
                  <Link href="/app/bla-bla/new">
                    <PlusCircle className="mr-2 h-4 w-4" />
                    bla bla bla
                  </Link>
                </Button>
                <Button variant="outline" asChild className="rounded-xl border-white/20 text-slate-100 hover:bg-white/5">
                  <Link href="/app/bla-bla">
                    <Eye className="mr-2 h-4 w-4" />
                    bla bla bla
                  </Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card className="rounded-2xl border-white/10 bg-slate-900/60 backdrop-blur">
          <CardHeader>
            <CardTitle className="text-slate-100">Why Use Larkx?</CardTitle>
            <CardDescription className="text-slate-400">bla bla bla</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid md:grid-cols-3 gap-6">
              <div>
                <h3 className="font-medium mb-2 flex items-center gap-2 text-slate-200">
                  <Zap className="h-4 w-4" />
                  bla bla bla
                </h3>
                <p className="text-sm text-slate-400">bla bla bla</p>
              </div>
              <div>
                <h3 className="font-medium mb-2 flex items-center gap-2 text-slate-200">
                  <Users className="h-4 w-4" />
                  bla bla bla
                </h3>
                <p className="text-sm text-slate-400">bla bla bla</p>
              </div>
              <div>
                <h3 className="font-medium mb-2 flex items-center gap-2 text-slate-200">
                  <Clock className="h-4 w-4" />
                  bla bla bla
                </h3>
                <p className="text-sm text-slate-400">bla bla bla</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
    </main>
  );
}
