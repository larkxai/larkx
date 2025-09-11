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
    <div className="container mx-auto p-6">
      <div>
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-2xl font-bold">Welcome to Larkx</h1>
            <p className="text-muted-foreground">bla bla bla</p>
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-6 mb-8">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <GitBranch className="h-5 w-5" />
              </CardTitle>
              <CardDescription>bla bla bla</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground mb-4">bla bla bla</p>
              <Button asChild>
                <Link href="/app/bla-bla/new">
                  <PlusCircle className="mr-2 h-4 w-4" />
                </Link>
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
              </CardTitle>
              <CardDescription>bla bla bla</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground mb-4">bla bla bla</p>
              <div className="space-x-3">
                <Button asChild>
                  <Link href="/app/bla-bla/new">
                    <PlusCircle className="mr-2 h-4 w-4" />
                    bla bla bla
                  </Link>
                </Button>
                <Button variant="outline" asChild>
                  <Link href="/app/bla-bla">
                    <Eye className="mr-2 h-4 w-4" />
                    bla bla bla
                  </Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Why Use Larkx?</CardTitle>
            <CardDescription>bla bla bla</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid md:grid-cols-3 gap-6">
              <div>
                <h3 className="font-medium mb-2 flex items-center gap-2">
                  <Zap className="h-4 w-4" />
                  bla bla bla
                </h3>
                <p className="text-sm text-muted-foreground">bla bla bla</p>
              </div>
              <div>
                <h3 className="font-medium mb-2 flex items-center gap-2">
                  <Users className="h-4 w-4" />
                  bla bla bla
                </h3>
                <p className="text-sm text-muted-foreground">bla bla bla</p>
              </div>
              <div>
                <h3 className="font-medium mb-2 flex items-center gap-2">
                  <Clock className="h-4 w-4" />
                  bla bla bla
                </h3>
                <p className="text-sm text-muted-foreground">bla bla bla</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
