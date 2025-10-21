"use client";

import React from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Check, Sparkles } from "lucide-react";

export default function PricingPage() {
  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-930 to-slate-900 text-slate-100">
      {/* Navbar */}
      <nav className="sticky top-0 z-40 backdrop-blur supports-[backdrop-filter]:bg-slate-950/60 border-b border-white/10">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-xl bg-gradient-to-br from-indigo-500 to-blue-500 grid place-items-center shadow-md">
              <Sparkles className="h-4 w-4" />
            </div>
            <span className="font-semibold tracking-tight">Larkx</span>
          </Link>

          <div className="flex items-center gap-3">
            <Link href="/app/dashboard">
              <Button
                size="sm"
                className="bg-indigo-500 hover:bg-indigo-600 rounded-xl"
              >
                Get started
              </Button>
            </Link>
          </div>
        </div>
      </nav>

      {/* Pricing Section */}
      <section className="container mx-auto px-4 py-20">
        <div className="text-center max-w-2xl mx-auto mb-16">
          <Badge className="bg-white/20 border-white/30 text-slate-100 mb-4">Pricing</Badge>
          <h1 className="text-4xl md:text-5xl font-bold mt-3 text-slate-100">
            Start free. Upgrade when you ship.
          </h1>
          <p className="text-slate-300 text-lg mt-4">
            Choose the plan that fits your app publishing needs. No hidden fees, cancel anytime.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-8 max-w-6xl mx-auto">
          <PriceCard
            tier="Free"
            price="$0"
            period="forever"
            cta="Get started"
            features={[
              "1 app submission",
              "Manual screenshots",
              "AI metadata (basic)",
              "Email support",
              "Basic rejection assistance"
            ]}
            description="Perfect for trying out Larkx"
          />
          <PriceCard
            highlight
            tier="Pro"
            price="$29"
            period="per month"
            cta="Go Pro"
            features={[
              "Unlimited app submissions",
              "AI-generated screenshots",
              "Advanced rejection fix assistant",
              "Real-time status alerts",
              "Priority support",
              "Multi-store sync"
            ]}
            description="Best for active app developers"
          />
          <PriceCard
            tier="Studio"
            price="$99"
            period="per month"
            cta="Contact sales"
            features={[
              "Everything in Pro",
              "Multi-app workspace",
              "Team collaboration",
              "Localization tools",
              "Custom integrations",
              "Dedicated account manager"
            ]}
            description="For teams and agencies"
          />
        </div>

        {/* FAQ Section */}
        <div className="max-w-3xl mx-auto mt-20">
          <h2 className="text-3xl font-bold text-center mb-12">Frequently Asked Questions</h2>
          <div className="space-y-6">
            <FAQItem
              question="Can I change plans anytime?"
              answer="Yes! You can upgrade or downgrade your plan at any time. Changes take effect immediately."
            />
            <FAQItem
              question="What happens if I cancel?"
              answer="You can cancel anytime. Your apps will remain live, but you won't be able to submit new versions."
            />
            <FAQItem
              question="Do you offer refunds?"
              answer="Yes, we offer a 30-day money-back guarantee for all paid plans. See our refund policy for details."
            />
            <FAQItem
              question="Is there a free trial?"
              answer="Yes! The Free plan lets you try Larkx with one submission. No credit card required."
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
            <Link href="/terms" className="hover:text-white">
              Terms
            </Link>
            <Link href="/privacy" className="hover:text-white">
              Privacy
            </Link>
            <Link href="/refund" className="hover:text-white">
              Refund Policy
            </Link>
          </div>
        </div>
      </footer>
    </main>
  );
}

function PriceCard({
  tier,
  price,
  period,
  cta,
  features,
  description,
  highlight,
}: {
  tier: string;
  price: string;
  period: string;
  cta: string;
  features: string[];
  description: string;
  highlight?: boolean;
}) {
  return (
    <Card
      className={`rounded-2xl ${
        highlight
          ? "border-indigo-400/40 shadow-[0_0_0_1px_rgba(129,140,248,.35)] scale-105"
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
        <p className="text-slate-400 text-sm">{description}</p>
      </CardHeader>
      <CardContent>
        <div className="text-4xl font-bold text-slate-100">{price}</div>
        <p className="text-slate-300 text-sm mt-1">{period}</p>
        <ul className="mt-6 space-y-3 text-sm text-slate-200">
          {features.map((feature, i) => (
            <li key={i} className="flex items-center gap-3">
              <Check className="h-4 w-4 text-emerald-400 flex-shrink-0" />
              {feature}
            </li>
          ))}
        </ul>
        <Button className={`mt-8 w-full rounded-xl ${
          highlight 
            ? "bg-indigo-500 hover:bg-indigo-600" 
            : "bg-white/10 hover:bg-white/20 text-slate-100"
        }`}>
          {cta}
        </Button>
      </CardContent>
    </Card>
  );
}

function FAQItem({ question, answer }: { question: string; answer: string }) {
  return (
    <div className="rounded-2xl border border-white/10 p-6 bg-slate-900/50">
      <h3 className="font-medium text-slate-100 mb-2">{question}</h3>
      <p className="text-slate-400 text-sm">{answer}</p>
    </div>
  );
}
