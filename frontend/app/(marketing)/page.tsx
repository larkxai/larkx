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
  const [isAuthenticated, setIsAuthenticated] = React.useState(false);
  const [isClient, setIsClient] = React.useState(false);
  
  // Check for session cookie to determine if user is authenticated
  // This matches the logic in middleware.ts
  React.useEffect(() => {
    setIsClient(true);
    const getSessionCookie = () => {
      const cookie = document.cookie.split('; ').find(row => row.startsWith('session='));
      return cookie ? cookie.split('=')[1] : null;
    };
    
    setIsAuthenticated(!!getSessionCookie());
  }, []);
  
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
{isClient ? (isAuthenticated ? "Go to console" : "Get started") : "Get started"}
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
              Single control center for app releases
            </Badge>
            <h1 className="text-4xl md:text-6xl font-bold leading-tight tracking-tight">
              The one window that manages{" "}
              <span className="text-indigo-400">App Store</span> &{" "}
              <span className="text-blue-400">Google Play</span> releases
            </h1>
            <p className="mt-5 text-slate-300 text-lg max-w-xl">
              Built for non-technical founders. Upload your build, AI handles everything else.
            </p>
            <div className="mt-6 flex flex-col sm:flex-row gap-3">
              <Link href="/app/dashboard">
                <Button className="rounded-2xl px-6 py-6 text-base bg-indigo-500 hover:bg-indigo-600">
                  <Rocket className="h-5 w-5 mr-2" /> {isClient ? (isAuthenticated ? "Go to console" : "Get started") : "Get started"}
                </Button>
              </Link>
            </div>
            <div className="mt-6 flex items-center gap-4 text-sm text-slate-400">
              <div className="flex items-center gap-2">
                <Check className="h-4 w-4 text-emerald-400" /> No technical skills required
              </div>
              <div className="flex items-center gap-2">
                <Check className="h-4 w-4 text-emerald-400" /> AI handles everything
              </div>
              <div className="flex items-center gap-2">
                <Check className="h-4 w-4 text-emerald-400" /> One window for both stores
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
                      <Sparkles className="h-4 w-4 text-purple-300" /> AI Magic
                    </div>
                    <p className="mt-1 text-slate-400">Generates everything</p>
                  </div>
                  <div className="p-3 rounded-xl bg-slate-800/60 border border-white/10">
                    <div className="text-slate-300 flex items-center gap-2">
                      <Store className="h-4 w-4 text-emerald-300" /> Go Live
                    </div>
                    <p className="mt-1 text-slate-400">Both stores ready</p>
                  </div>
                </div>
                <div className="rounded-xl border border-white/10 p-4 bg-slate-800/50">
                  <p className="text-sm text-slate-300">
                    "As a non-technical founder, I was dreading the app store process. Larkx made it effortless — one upload, and everything was handled automatically. No more juggling multiple consoles."
                  </p>
                  <p className="text-xs text-slate-500 mt-2">— No-code founder</p>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Comparison Table */}
      <section className="container mx-auto px-4 pb-16">
        <div className="text-center max-w-3xl mx-auto mb-8">
          <Badge className="bg-white/20 border-white/30 text-slate-100 mb-4">The Difference</Badge>
          <h2 className="text-3xl md:text-4xl font-semibold">
            Before vs With Larkx
          </h2>
        </div>
        <div className="max-w-5xl mx-auto">
          <div className="overflow-hidden rounded-3xl border-2 border-white/20 bg-slate-900/80 backdrop-blur shadow-2xl">
            {/* Header Row */}
            <div className="grid grid-cols-3 border-b-2 border-white/20">
              <div className="p-8 bg-slate-800/60">
                <div className="flex items-center gap-3">
                  <div className="w-3 h-3 rounded-full bg-slate-400"></div>
                  <h3 className="text-xl font-bold text-slate-100">Task</h3>
                </div>
              </div>
              <div className="p-8 bg-red-900/30 relative">
                <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-red-500/50 to-red-600/50"></div>
                <div className="flex items-center gap-3">
                  <div className="w-3 h-3 rounded-full bg-red-400"></div>
                  <h3 className="text-xl font-bold text-red-300">Without Larkx</h3>
                </div>
              </div>
              <div className="p-8 bg-emerald-900/30 relative">
                <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-emerald-500/50 to-emerald-600/50"></div>
                <div className="flex items-center gap-3">
                  <div className="w-3 h-3 rounded-full bg-emerald-400"></div>
                  <h3 className="text-xl font-bold text-emerald-300">With Larkx</h3>
                </div>
              </div>
            </div>
            
            {/* Data Rows */}
            <div className="grid grid-cols-3 border-b border-white/10">
              <div className="p-6 bg-slate-800/60 flex items-center gap-3">
                <div className="w-2 h-2 rounded-full bg-indigo-400"></div>
                <span className="text-base font-medium text-slate-200">Screenshots</span>
              </div>
              <div className="p-6 bg-red-900/30 flex items-center gap-3">
                <div className="w-5 h-5 rounded-full bg-red-500/20 flex items-center justify-center flex-shrink-0">
                  <div className="w-2 h-2 rounded-full bg-red-400"></div>
                </div>
                <span className="text-base text-red-200">Hire designer, wait weeks</span>
              </div>
              <div className="p-6 bg-emerald-900/30 flex items-center gap-3">
                <div className="w-5 h-5 rounded-full bg-emerald-500/20 flex items-center justify-center flex-shrink-0">
                  <Check className="w-3 h-3 text-emerald-400" />
                </div>
                <span className="text-base text-emerald-200">AI generates in minutes</span>
              </div>
            </div>
            
            <div className="grid grid-cols-3 border-b border-white/10">
              <div className="p-6 bg-slate-800/60 flex items-center gap-3">
                <div className="w-2 h-2 rounded-full bg-indigo-400"></div>
                <span className="text-base font-medium text-slate-200">Store Descriptions</span>
              </div>
              <div className="p-6 bg-red-900/30 flex items-center gap-3">
                <div className="w-5 h-5 rounded-full bg-red-500/20 flex items-center justify-center flex-shrink-0">
                  <div className="w-2 h-2 rounded-full bg-red-400"></div>
                </div>
                <span className="text-base text-red-200">Write from scratch, guess keywords</span>
              </div>
              <div className="p-6 bg-emerald-900/30 flex items-center gap-3">
                <div className="w-5 h-5 rounded-full bg-emerald-500/20 flex items-center justify-center flex-shrink-0">
                  <Check className="w-3 h-3 text-emerald-400" />
                </div>
                <span className="text-base text-emerald-200">AI writes optimized content</span>
              </div>
            </div>
            
            <div className="grid grid-cols-3 border-b border-white/10">
              <div className="p-6 bg-slate-800/60 flex items-center gap-3">
                <div className="w-2 h-2 rounded-full bg-indigo-400"></div>
                <span className="text-base font-medium text-slate-200">Privacy Policy</span>
              </div>
              <div className="p-6 bg-red-900/30 flex items-center gap-3">
                <div className="w-5 h-5 rounded-full bg-red-500/20 flex items-center justify-center flex-shrink-0">
                  <div className="w-2 h-2 rounded-full bg-red-400"></div>
                </div>
                <span className="text-base text-red-200">Guess template or hire lawyer</span>
              </div>
              <div className="p-6 bg-emerald-900/30 flex items-center gap-3">
                <div className="w-5 h-5 rounded-full bg-emerald-500/20 flex items-center justify-center flex-shrink-0">
                  <Check className="w-3 h-3 text-emerald-400" />
                </div>
                <span className="text-base text-emerald-200">AI creates automatically</span>
              </div>
            </div>
            
            <div className="grid grid-cols-3 border-b border-white/10">
              <div className="p-6 bg-slate-800/60 flex items-center gap-3">
                <div className="w-2 h-2 rounded-full bg-indigo-400"></div>
                <span className="text-base font-medium text-slate-200">Rejection Handling</span>
              </div>
              <div className="p-6 bg-red-900/30 flex items-center gap-3">
                <div className="w-5 h-5 rounded-full bg-red-500/20 flex items-center justify-center flex-shrink-0">
                  <div className="w-2 h-2 rounded-full bg-red-400"></div>
                </div>
                <span className="text-base text-red-200">Decode cryptic emails, panic</span>
              </div>
              <div className="p-6 bg-emerald-900/30 flex items-center gap-3">
                <div className="w-5 h-5 rounded-full bg-emerald-500/20 flex items-center justify-center flex-shrink-0">
                  <Check className="w-3 h-3 text-emerald-400" />
                </div>
                <span className="text-base text-emerald-200">Plain English + auto-fix</span>
              </div>
            </div>
            
            <div className="grid grid-cols-3">
              <div className="p-6 bg-slate-800/60 flex items-center gap-3">
                <div className="w-2 h-2 rounded-full bg-indigo-400"></div>
                <span className="text-base font-medium text-slate-200">Multi-Store Sync</span>
              </div>
              <div className="p-6 bg-red-900/30 flex items-center gap-3">
                <div className="w-5 h-5 rounded-full bg-red-500/20 flex items-center justify-center flex-shrink-0">
                  <div className="w-2 h-2 rounded-full bg-red-400"></div>
                </div>
                <span className="text-base text-red-200">Manual sync, version chaos</span>
              </div>
              <div className="p-6 bg-emerald-900/30 flex items-center gap-3">
                <div className="w-5 h-5 rounded-full bg-emerald-500/20 flex items-center justify-center flex-shrink-0">
                  <Check className="w-3 h-3 text-emerald-400" />
                </div>
                <span className="text-base text-emerald-200">Perfect sync automatically</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="container mx-auto px-4 pb-20">
        <div className="text-center max-w-2xl mx-auto mb-10">
          <Badge className="bg-white/20 border-white/30 text-slate-100">How It Works</Badge>
          <h2 className="text-3xl md:text-4xl font-semibold mt-3 text-slate-100">
            Upload → AI handles everything → Live
          </h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <FeatureCard
            icon={<Upload className="h-5 w-5" />}
            title="Upload Build"
            desc="Drop your .aab/.ipa file. That's it."
          />
          <FeatureCard
            icon={<Sparkles className="h-5 w-5" />}
            title="AI Magic"
            desc="Generates screenshots, descriptions, privacy policy."
          />
          <FeatureCard
            icon={<Store className="h-5 w-5" />}
            title="Go Live"
            desc="Submits to both stores simultaneously."
          />
        </div>
      </section>

      {/* Stats */}
      <section id="how" className="container mx-auto px-4 pb-20">
        <div className="grid md:grid-cols-3 gap-8 text-center">
          <div className="p-6 rounded-2xl border border-white/10 bg-slate-900/60">
            <div className="text-4xl font-bold text-indigo-400 mb-2">15 min</div>
            <div className="text-slate-300">Average time to live</div>
          </div>
          <div className="p-6 rounded-2xl border border-white/10 bg-slate-900/60">
            <div className="text-4xl font-bold text-emerald-400 mb-2">95%</div>
            <div className="text-slate-300">First-time approval rate</div>
          </div>
          <div className="p-6 rounded-2xl border border-white/10 bg-slate-900/60">
            <div className="text-4xl font-bold text-blue-400 mb-2">1</div>
            <div className="text-slate-300">Interface for both stores</div>
              </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="container mx-auto px-4 pb-20">
        <div className="text-center max-w-2xl mx-auto mb-10">
          <Badge className="bg-white/20 border-white/30 text-slate-100">Pricing</Badge>
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
        <div className="max-w-2xl mx-auto">
          <div className="text-center mb-8">
            <Badge className="bg-white/20 border-white/30 text-slate-100 mb-4">FAQ</Badge>
            <h2 className="text-3xl font-semibold">Got questions?</h2>
          </div>
          <div className="space-y-4">
          <FaqItem
              q="I'm not technical. Can I use this?"
              a="Yes! Larkx is built for non-technical founders. Upload your build, AI does the rest."
          />
          <FaqItem
              q="What if my app gets rejected?"
              a="AI explains rejections in plain English and auto-fixes most issues. Resubmit in minutes."
          />
          <FaqItem
              q="How fast can I go live?"
              a="Most apps go live in under 15 minutes. Upload → AI magic → Live on both stores."
          />
          </div>
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
