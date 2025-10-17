"use client"

import React from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useAuthStore } from "@/lib/store/auth";
import {
  Check,
  Rocket,
  LineChart,
  Sparkles,
  Shield,
  Upload,
  Images,
  RefreshCw,
  Store,
  Github,
} from "lucide-react";

export default function HomePage() {
  const { user } = useAuthStore();
  
  // Check for session cookie to determine if user is authenticated
  // This matches the logic in middleware.ts
  const getSessionCookie = () => {
    if (typeof document === 'undefined') return null;
    const cookie = document.cookie.split('; ').find(row => row.startsWith('session='));
    return cookie ? cookie.split('=')[1] : null;
  };
  
  const isAuthenticated = !!getSessionCookie();
  
  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-930 to-slate-900 text-slate-100">
      {/* Navbar */}
      <nav className="sticky top-0 z-40 backdrop-blur supports-[backdrop-filter]:bg-slate-950/60 border-b border-white/10">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <Link href="#" className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-xl bg-gradient-to-br from-indigo-500 to-blue-500 grid place-items-center shadow-md">
              <Sparkles className="h-4 w-4" />
            </div>
            <span className="font-semibold tracking-tight">Larkx</span>
          </Link>

          <div className="hidden md:flex items-center gap-6 text-sm text-slate-300">
            <Link href="#features" className="hover:text-white">
              Features
            </Link>
            <Link href="#how" className="hover:text-white">
              How it works
            </Link>
            <Link href="#pricing" className="hover:text-white">
              Pricing
            </Link>
            <Link href="#faq" className="hover:text-white">
              FAQ
            </Link>
          </div>

          <div className="flex items-center gap-3">
            <Link href="/app/dashboard">
              <Button
                size="sm"
                className="bg-indigo-500 hover:bg-indigo-600 rounded-xl"
              >
                {isAuthenticated ? "Go to console" : "Get started"}
              </Button>
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="container mx-auto px-4 pt-16 md:pt-24 pb-10">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-10 items-center">
          <div>
            <Badge className="bg-white/10 text-slate-100 border-white/20 mb-4">
              Last‑mile mobile publishing
            </Badge>
            <h1 className="text-4xl md:text-6xl font-bold leading-tight tracking-tight">
              Ship no‑code apps to{" "}
              <span className="text-indigo-400">App Store</span> &{" "}
              <span className="text-blue-400">Google Play</span> — in minutes.
            </h1>
            <p className="mt-5 text-slate-300 text-lg max-w-xl">
              Larkx is an AI agent that finishes the last 10%: upload your{" "}
              <code>.aab</code>/<code>.ipa</code>, auto‑generate metadata &
              screenshots, submit, track, and fix rejections.
            </p>
            <div className="mt-6 flex flex-col sm:flex-row gap-3">
              <Link href="/app/dashboard">
                <Button className="rounded-2xl px-6 py-6 text-base bg-indigo-500 hover:bg-indigo-600">
                  <Rocket className="h-5 w-5 mr-2" /> {isAuthenticated ? "Go to console" : "Get started"}
                </Button>
              </Link>
              <Link href="#features">
                <Button
                  variant="outline"
                  className="rounded-2xl px-6 py-6 text-base border-white/20 text-slate-100 hover:bg-white/5"
                >
                  See features
                </Button>
              </Link>
            </div>
            <div className="mt-6 flex items-center gap-4 text-sm text-slate-400">
              <div className="flex items-center gap-2">
                <Check className="h-4 w-4 text-emerald-400" /> No Xcode or Play
                Console needed
              </div>
              <div className="flex items-center gap-2">
                <Check className="h-4 w-4 text-emerald-400" /> AI metadata &
                screenshots
              </div>
            </div>
          </div>

          <div className="relative">
            <div className="absolute -inset-4 bg-gradient-to-tr from-indigo-500/20 to-blue-500/10 blur-2xl rounded-3xl" />
            <Card className="relative rounded-3xl border-white/10 bg-slate-900/60 backdrop-blur">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-slate-100">
                  <Store className="h-5 w-5 text-indigo-400" /> Store Submission
                  Preview
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-3 gap-3 text-sm">
                  <div className="p-3 rounded-xl bg-slate-800/60 border border-white/10">
                    <div className="text-slate-300 flex items-center gap-2">
                      <Upload className="h-4 w-4 text-blue-300" /> Upload
                    </div>
                    <p className="mt-1 text-slate-400">Drop .aab/.ipa</p>
                  </div>
                  <div className="p-3 rounded-xl bg-slate-800/60 border border-white/10">
                    <div className="text-slate-300 flex items-center gap-2">
                      <Images className="h-4 w-4 text-pink-300" /> Screenshots
                    </div>
                    <p className="mt-1 text-slate-400">Auto sizes & checks</p>
                  </div>
                  <div className="p-3 rounded-xl bg-slate-800/60 border border-white/10">
                    <div className="text-slate-300 flex items-center gap-2">
                      <RefreshCw className="h-4 w-4 text-emerald-300" /> Submit
                    </div>
                    <p className="mt-1 text-slate-400">Track & resubmit</p>
                  </div>
                </div>
                <div className="rounded-xl border border-white/10 p-4 bg-slate-800/50">
                  <p className="text-sm text-slate-300">
                    Larkx submitted our FlutterFlow export to both stores in
                    under 15 minutes. The rejection fix flow saved us days.”
                  </p>
                  <p className="text-xs text-slate-500 mt-2">— Early user</p>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Logos / social proof placeholder */}
      <section className="container mx-auto px-4 pb-16">
        <div className="rounded-2xl border border-white/10 bg-slate-900/40 p-6 md:p-8 text-center">
          <p className="text-slate-400 text-sm">
            Built for creators using FlutterFlow, Vibecoding, React Native, and
            more.
          </p>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="container mx-auto px-4 pb-20">
        <div className="text-center max-w-2xl mx-auto mb-10">
          <Badge className="bg-white/10 border-white/20">Features</Badge>
          <h2 className="text-3xl md:text-4xl font-semibold mt-3">
            Everything you need to go live
          </h2>
          <p className="text-slate-400 mt-2">
            From exported build to store listing — Larkx automates the last
            mile.
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <FeatureCard
            icon={<Upload className="h-5 w-5" />}
            title=".aab/.ipa Upload"
            desc="Drag & drop your build. We parse versions, bundle IDs, permissions."
          />
          <FeatureCard
            icon={<Sparkles className="h-5 w-5" />}
            title="AI Metadata"
            desc="Generate titles, descriptions, keywords with length checks & locales."
          />
          <FeatureCard
            icon={<Images className="h-5 w-5" />}
            title="Screenshot Validator"
            desc="Auto-resize & validate required sets for App Store and Play."
          />
          <FeatureCard
            icon={<Store className="h-5 w-5" />}
            title="Store Submission"
            desc="Submit to TestFlight / Internal Testing, then promote to production."
          />
          <FeatureCard
            icon={<Shield className="h-5 w-5" />}
            title="Preflight Compliance"
            desc="Catch privacy strings, data safety, icons & policy issues before review."
          />
          <FeatureCard
            icon={<RefreshCw className="h-5 w-5" />}
            title="Rejections → Fix → Resubmit"
            desc="Plain‑English errors, one‑click resubmission with version bump."
          />
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="container mx-auto px-4 pb-20">
        <div className="grid md:grid-cols-2 gap-8 items-start">
          <div>
            <h3 className="text-2xl md:text-3xl font-semibold">How it works</h3>
            <p className="text-slate-400 mt-3">
              Five simple steps — no consoles, no CLI.
            </p>
            <ol className="mt-6 space-y-4 text-slate-300">
              <li className="flex gap-3">
                <span className="text-indigo-400">1.</span> Upload your{" "}
                <code>.aab</code>/<code>.ipa</code>.
              </li>
              <li className="flex gap-3">
                <span className="text-indigo-400">2.</span> Connect App Store
                Connect and Google Play once.
              </li>
              <li className="flex gap-3">
                <span className="text-indigo-400">3.</span> We help you generate content and all required fields automatically.
              </li>
              <li className="flex gap-3">
                <span className="text-indigo-400">4.</span> Generate or edit
                metadata & screenshots.
              </li>
              <li className="flex gap-3">
                <span className="text-indigo-400">5.</span> Submit, track
                status, fix rejections with AI help.
              </li>
            </ol>
          </div>
          <Card className="rounded-2xl border-white/10 bg-slate-900/90 backdrop-blur">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-slate-100">
                <LineChart className="h-5 w-5 text-indigo-400" /> Roadmap
              </CardTitle>
            </CardHeader>
            <CardContent className="text-slate-200 text-sm">
              <div className="space-y-3">
                <RoadItem
                  title="Phase 1 – MVP"
                  points={[
                    "Upload & Submit",
                    "AI metadata",
                    "Screenshot validator",
                    "Rejection handling",
                  ]}
                />
                <RoadItem
                  title="Phase 2 – A/B & Analytics"
                  points={[
                    "Variant testing for titles/screenshots",
                    "Store analytics ingestion",
                    "Auto‑promote winners",
                  ]}
                />
                <RoadItem
                  title="Phase 3 – Optional CI"
                  points={[
                    "Code → Build → Submit",
                    "Signing automation",
                    "GitHub/GitLab integrations",
                  ]}
                />
              </div>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="container mx-auto px-4 pb-20">
        <div className="text-center max-w-2xl mx-auto mb-10">
          <Badge className="bg-white/10 border-white/20">Pricing</Badge>
          <h3 className="text-3xl md:text-4xl font-semibold mt-3">
            Start free. Upgrade when you ship.
          </h3>
        </div>
        <div className="grid md:grid-cols-3 gap-6">
          <PriceCard
            tier="Free"
            price="$0"
            cta="Get started"
            features={[
              "1 submission",
              "Manual screenshots",
              "AI metadata (basic)",
              "Email support",
            ]}
          />
          <PriceCard
            highlight
            tier="Pro"
            price="$29/mo"
            cta="Go Pro"
            features={[
              "Unlimited submissions",
              "Mockup screenshots",
              "Rejection fix assistant",
              "Status alerts",
            ]}
          />
          <PriceCard
            tier="Studio"
            price="$99/mo"
            cta="Contact sales"
            features={[
              "Multi‑app workspace",
              "Localization tools",
              "Team roles",
              "Priority support",
            ]}
          />
        </div>
      </section>


      {/* FAQ */}
      <section id="faq" className="container mx-auto px-4 pb-28">
        <div className="grid md:grid-cols-2 gap-6">
          <FaqItem
            q="Do I need Xcode or the Play Console?"
            a="No. Upload your .aab/.ipa and connect store accounts once. Larkx handles submission and status tracking."
          />
          <FaqItem
            q="Can you fix rejections?"
            a="We surface the reason, point to the exact field, and guide you through a fix + resubmit flow. Some Apple reviewer messages still require opening App Store Connect to reply."
          />
          <FaqItem
            q="Do you support FlutterFlow & Vibecoding?"
            a="Yes. If your builder can export .aab/.ipa, we can ship it."
          />
          <FaqItem
            q="What’s coming next?"
            a="Phase 2 adds A/B testing & analytics; Phase 3 adds optional CI for code-based teams."
          />
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/10">
        <div className="container mx-auto px-4 py-10 flex flex-col md:flex-row items-center justify-between gap-4">
          <p className="text-slate-400 text-sm">
            © {new Date().getFullYear()} Larkx. All rights reserved.
          </p>
          <div className="flex items-center gap-6 text-sm text-slate-400">
            <Link href="#" className="hover:text-white">
              Privacy
            </Link>
            <Link href="#" className="hover:text-white">
              Terms
            </Link>
            <Link href="#" className="hover:text-white">
              Contact
            </Link>
          </div>
        </div>
      </footer>
    </main>
  );
}

function FeatureCard({
  icon,
  title,
  desc,
}: {
  icon: React.ReactNode;
  title: string;
  desc: string;
}) {
  return (
    <Card className="rounded-2xl border-white/10 bg-slate-900/50">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-slate-100">
          <span className="text-indigo-400">{icon}</span>
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-slate-400 text-sm">{desc}</p>
      </CardContent>
    </Card>
  );
}

function RoadItem({ title, points }: { title: string; points: string[] }) {
  return (
    <div>
      <h4 className="font-medium text-slate-100">{title}</h4>
      <ul className="mt-2 space-y-1 text-slate-300 list-disc list-inside">
        {points.map((p, i) => (
          <li key={i}>{p}</li>
        ))}
      </ul>
    </div>
  );
}

function PriceCard({
  tier,
  price,
  cta,
  features,
  highlight,
}: {
  tier: string;
  price: string;
  cta: string;
  features: string[];
  highlight?: boolean;
}) {
  return (
    <Card
      className={`rounded-2xl ${
        highlight
          ? "border-indigo-400/40 shadow-[0_0_0_1px_rgba(129,140,248,.35)]"
          : "border-white/10"
      } bg-slate-900/90 backdrop-blur`}
    >
      <CardHeader>
        <CardTitle className="text-slate-100 flex items-center justify-between">
          {tier}
          {highlight && (
            <Badge className="bg-indigo-500/20 text-indigo-300 border-indigo-400/30">
              Popular
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-4xl font-bold text-slate-100">{price}</div>
        <p className="text-slate-300 text-sm mt-1">per month</p>
        <ul className="mt-4 space-y-2 text-sm text-slate-200">
          {features.map((f, i) => (
            <li key={i} className="flex items-center gap-2">
              <Check className="h-4 w-4 text-emerald-400" />
              {f}
            </li>
          ))}
        </ul>
        <Button className="mt-6 w-full rounded-xl bg-indigo-500 hover:bg-indigo-600">
          {cta}
        </Button>
      </CardContent>
    </Card>
  );
}

function FaqItem({ q, a }: { q: string; a: string }) {
  return (
    <div className="rounded-2xl border border-white/10 p-6 bg-slate-900/50">
      <h5 className="font-medium text-slate-100">{q}</h5>
      <p className="text-slate-400 text-sm mt-2">{a}</p>
    </div>
  );
}
