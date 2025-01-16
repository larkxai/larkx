"use client";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Zap,
  Shield,
  Users,
  Clock,
  Check,
  ArrowRight,
  Star,
  Lock,
  Code,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

export default function HomePage() {
  const [typingStage, setTypingStage] = useState(0);
  const [showAIResponse, setShowAIResponse] = useState(false);

  useEffect(() => {
    const timer = setTimeout(
      () => {
        if (typingStage < 4) {
          setTypingStage((prev) => prev + 1);
        } else if (typingStage === 4) {
          setShowAIResponse(true);
        }
      },
      typingStage === 0 ? 1000 : 2000
    );

    return () => clearTimeout(timer);
  }, [typingStage]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white dark:from-slate-950 dark:to-slate-900">
      {/* Hero Section */}
      <section className="relative overflow-hidden bg-gradient-to-b from-primary/5 via-primary/[0.02] to-transparent">
        <div className="absolute inset-0 bg-grid-slate-200/20 dark:bg-grid-slate-800/20 [mask-image:linear-gradient(0deg,transparent,black)]" />
        <div className="container relative mx-auto px-4 sm:px-6 py-20 sm:py-32 flex flex-col items-center text-center">
          <div
            className="absolute inset-x-0 -top-40 -z-10 transform-gpu overflow-hidden blur-3xl sm:-top-80"
            aria-hidden="true"
          >
            <div className="relative left-[calc(50%-11rem)] aspect-[1155/678] w-[36.125rem] -translate-x-1/2 rotate-[30deg] bg-gradient-to-tr from-primary to-purple-500 opacity-20 sm:left-[calc(50%-30rem)] sm:w-[72.1875rem]"></div>
          </div>
          <span className="relative inline-flex items-center px-4 sm:px-6 py-2 mb-6 sm:mb-8 text-sm font-semibold bg-gradient-to-r from-amber-100/80 to-yellow-100/80 text-amber-800 rounded-full ring-1 ring-amber-300/50 shadow-lg shadow-amber-200/20 backdrop-blur-sm">
            <div className="absolute -inset-0.5 bg-gradient-to-r from-amber-400/30 to-yellow-400/30 rounded-full blur-sm"></div>
            <div className="absolute inset-0 bg-gradient-to-r from-amber-100/80 to-yellow-100/80 rounded-full"></div>
            <span className="relative flex items-center gap-2">
              <svg
                className="w-4 h-4 text-amber-600"
                viewBox="0 0 24 24"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  d="M12 2L2 7L12 12L22 7L12 2Z"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d="M2 17L12 22L22 17"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d="M2 12L12 17L22 12"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              Just Type, AI Does the Rest
            </span>
          </span>
          <h1 className="text-4xl sm:text-5xl lg:text-7xl font-extrabold tracking-tight mb-6 sm:mb-8 leading-[1.2] bg-gradient-to-br from-gray-900 via-gray-700 to-gray-800 dark:from-white dark:via-gray-200 dark:to-gray-300 bg-clip-text text-transparent">
            <span className="bg-gradient-to-r from-primary via-purple-500 to-purple-600 dark:from-primary dark:via-purple-400 dark:to-purple-500 bg-clip-text inline-block mt-3 sm:mt-4 animate-gradient">
              AI Agent for Hiring Automation
            </span>
            <span className="inline-block mt-4 sm:mt-5 text-3xl sm:text-4xl lg:text-5xl bg-gradient-to-br from-gray-800 to-gray-900 dark:from-gray-100 dark:to-gray-200 bg-clip-text">
              No Technical Skills Required
            </span>
          </h1>
          <p className="text-lg sm:text-xl lg:text-2xl text-muted-foreground/90 max-w-2xl mb-10 sm:mb-14 px-4 leading-relaxed font-medium">
            Simply chat with our AI assistant, and it automates recruitment
            tasks instantly—no coding, no complexity, just faster hiring
          </p>
          <div className="flex flex-col items-center gap-6 sm:gap-8 w-full max-w-3xl mb-8 sm:mb-12 px-4">
            <div className="bg-white/90 dark:bg-slate-900/90 backdrop-blur-xl p-6 sm:p-8 rounded-xl w-full border border-slate-200 dark:border-slate-800 shadow-2xl relative group overflow-hidden">
              {/* Animated gradient background */}
              <div className="absolute inset-0">
                <div className="absolute inset-0 bg-gradient-to-r from-primary/10 via-purple-500/10 to-primary/10 animate-wave-x"></div>
                <div className="absolute inset-0 bg-gradient-to-b from-primary/5 via-transparent to-purple-500/5 animate-wave-y"></div>
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_120%,rgba(120,119,198,0.1),rgba(255,255,255,0))]"></div>
              </div>

              {/* Command input section */}
              <div className="relative space-y-6">
                <div className="flex items-center gap-3">
                  <div className="w-3 h-3 rounded-full bg-amber-400/80 animate-pulse"></div>
                  <p className="text-sm font-medium text-amber-700 dark:text-amber-300 flex items-center gap-2">
                    You type in plain English
                    <span className="inline-block w-1.5 h-4 bg-amber-400/60 animate-blink"></span>
                  </p>
                </div>
                <div className="relative font-mono text-sm sm:text-base leading-relaxed">
                  <div className="absolute -left-3 top-0 bottom-0 w-[3px] bg-gradient-to-b from-primary/40 via-primary/20 to-purple-500/40 rounded-full"></div>
                  <div className="space-y-6">
                    <p className="text-slate-900 dark:text-white font-medium pl-4">
                      &ldquo;Hey Larkx, help me hire delivery drivers:&rdquo;
                    </p>
                    <div className="pl-6 space-y-3">
                      <div
                        className="flex items-start gap-3 opacity-0 animate-slideIn"
                        style={{
                          animationDelay: "0.2s",
                          animationFillMode: "forwards",
                        }}
                      >
                        <span className="text-amber-600 dark:text-amber-400 font-medium">
                          1.
                        </span>
                        <span className="text-slate-800 dark:text-slate-100">
                          Screen new applications 24/7
                        </span>
                      </div>
                      <div
                        className="flex items-start gap-3 opacity-0 animate-slideIn"
                        style={{
                          animationDelay: "0.4s",
                          animationFillMode: "forwards",
                        }}
                      >
                        <span className="text-amber-600 dark:text-amber-400 font-medium">
                          2.
                        </span>
                        <span className="text-slate-800 dark:text-slate-100">
                          Check driver&apos;s license and experience
                        </span>
                      </div>
                      <div
                        className="flex items-start gap-3 opacity-0 animate-slideIn"
                        style={{
                          animationDelay: "0.6s",
                          animationFillMode: "forwards",
                        }}
                      >
                        <span className="text-amber-600 dark:text-amber-400 font-medium">
                          3.
                        </span>
                        <span className="text-slate-800 dark:text-slate-100">
                          Send personalized welcome messages
                        </span>
                      </div>
                      <div
                        className="flex items-start gap-3 opacity-0 animate-slideIn"
                        style={{
                          animationDelay: "0.8s",
                          animationFillMode: "forwards",
                        }}
                      >
                        <span className="text-amber-600 dark:text-amber-400 font-medium">
                          4.
                        </span>
                        <span className="text-slate-800 dark:text-slate-100">
                          Schedule interviews for qualified candidates
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* AI Response section */}
              <div className="relative mt-8">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-3 h-3 rounded-full bg-primary animate-ping"></div>
                  <p className="text-sm font-medium  text-amber-700 dark:text-amber-300 flex items-center gap-2">
                    AI Agent creates automation
                    <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24">
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                        fill="none"
                      />
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                      />
                    </svg>
                  </p>
                </div>
                <div className="bg-gradient-to-r from-slate-50/90 via-white/90 to-slate-50/90 dark:from-slate-800/90 dark:via-slate-900/90 dark:to-slate-800/90 rounded-lg p-5 font-mono text-sm border border-slate-200/50 dark:border-slate-700/50">
                  <div className="space-y-3">
                    <div
                      className="flex items-center gap-3 opacity-0 animate-fadeSlideUp"
                      style={{
                        animationDelay: "1s",
                        animationFillMode: "forwards",
                      }}
                    >
                      <svg
                        className="w-5 h-5 text-emerald-500"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M5 13l4 4L19 7"
                        />
                      </svg>
                      <span className="text-slate-900 dark:text-white">
                        Application monitoring workflow created
                      </span>
                    </div>
                    <div
                      className="flex items-center gap-3 opacity-0 animate-fadeSlideUp"
                      style={{
                        animationDelay: "1.2s",
                        animationFillMode: "forwards",
                      }}
                    >
                      <svg
                        className="w-5 h-5 text-emerald-500"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M5 13l4 4L19 7"
                        />
                      </svg>
                      <span className="text-slate-900 dark:text-white">
                        Document verification setup
                      </span>
                    </div>
                    <div
                      className="flex items-center gap-3 opacity-0 animate-fadeSlideUp"
                      style={{
                        animationDelay: "1.4s",
                        animationFillMode: "forwards",
                      }}
                    >
                      <svg
                        className="w-5 h-5 text-emerald-500"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M5 13l4 4L19 7"
                        />
                      </svg>
                      <span className="text-slate-900 dark:text-white">
                        Automated messaging configured
                      </span>
                    </div>
                    <div
                      className="flex items-center gap-3 opacity-0 animate-fadeSlideUp"
                      style={{
                        animationDelay: "1.6s",
                        animationFillMode: "forwards",
                      }}
                    >
                      <svg
                        className="w-5 h-5 text-emerald-500"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M5 13l4 4L19 7"
                        />
                      </svg>
                      <span className="text-slate-900 dark:text-white">
                        Smart scheduling system enabled
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Add required keyframes */}
          <style jsx global>{`
            @keyframes wave-x {
              0%,
              100% {
                transform: translateX(-50%);
              }
              50% {
                transform: translateX(50%);
              }
            }
            @keyframes wave-y {
              0%,
              100% {
                transform: translateY(-25%);
              }
              50% {
                transform: translateY(25%);
              }
            }
            @keyframes blink {
              0%,
              100% {
                opacity: 0;
              }
              50% {
                opacity: 1;
              }
            }
            @keyframes slideIn {
              from {
                transform: translateX(-10px);
                opacity: 0;
              }
              to {
                transform: translateX(0);
                opacity: 1;
              }
            }
            @keyframes fadeSlideUp {
              from {
                transform: translateY(10px);
                opacity: 0;
              }
              to {
                transform: translateY(0);
                opacity: 1;
              }
            }
            .animate-wave-x {
              animation: wave-x 20s ease-in-out infinite;
            }
            .animate-wave-y {
              animation: wave-y 15s ease-in-out infinite;
            }
            .animate-blink {
              animation: blink 1s step-end infinite;
            }
            .animate-slideIn {
              animation: slideIn 0.5s ease-out;
            }
            .animate-fadeSlideUp {
              animation: fadeSlideUp 0.5s ease-out;
            }
          `}</style>
          <div className="flex flex-col sm:flex-row gap-3 sm:gap-6 w-full max-w-md px-4">
            <Link href="/app/dashboard" className="w-full">
              <Button
                size="lg"
                className="w-full bg-primary hover:bg-primary/90 text-white px-6 sm:px-8 h-12 text-base shadow-lg shadow-primary/25"
              >
                Talk to Your AI Agent
              </Button>
            </Link>
            <Button
              size="lg"
              variant="outline"
              className="w-full border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 h-12 px-6 sm:px-8 text-base"
            >
              Watch Demo
            </Button>
          </div>
        </div>
      </section>

      {/* Trusted By Section */}
      <div className="container mx-auto px-4 pb-16">
        <p className="text-sm text-center text-muted-foreground mb-8">
          Trusted by innovative companies
        </p>
        <div className="flex flex-wrap justify-center gap-8 opacity-60">
          {/* Add company logos here */}
        </div>
      </div>

      {/* Problem & Solution */}
      <section className="py-24 bg-slate-50/50 dark:bg-slate-900/50">
        <div className="container mx-auto px-4">
          <div className="max-w-3xl mx-auto text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold mb-6">
              Transform Your Hiring Process
            </h2>
            <p className="text-lg text-muted-foreground mb-8">
              Traditional hiring is slow, manual, and prone to candidate
              drop-off. Our AI agent automates the entire process, making it
              faster, more efficient, and candidate-friendly.
            </p>
            <div className="grid sm:grid-cols-3 gap-8">
              <div className="flex flex-col items-center p-6 rounded-lg bg-white dark:bg-slate-800 shadow-sm">
                <Clock className="w-8 h-8 text-primary mb-4" />
                <h3 className="font-semibold mb-2">Save Time</h3>
                <p className="text-sm text-muted-foreground">
                  Reduce hiring time by 70%
                </p>
              </div>
              <div className="flex flex-col items-center p-6 rounded-lg bg-white dark:bg-slate-800 shadow-sm">
                <Users className="w-8 h-8 text-primary mb-4" />
                <h3 className="font-semibold mb-2">Better Candidates</h3>
                <p className="text-sm text-muted-foreground">
                  2x qualified candidate rate
                </p>
              </div>
              <div className="flex flex-col items-center p-6 rounded-lg bg-white dark:bg-slate-800 shadow-sm">
                <Zap className="w-8 h-8 text-primary mb-4" />
                <h3 className="font-semibold mb-2">Instant Response</h3>
                <p className="text-sm text-muted-foreground">
                  24/7 candidate engagement
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Key Benefits & Features */}
      <section className="py-24">
        <div className="container mx-auto px-4">
          <h2 className="text-3xl sm:text-4xl font-bold text-center mb-16">
            Why Choose Larkx
          </h2>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8 mb-16">
            <Card className="border-slate-200 dark:border-slate-800 bg-white/60 dark:bg-slate-900/60 backdrop-blur-xl shadow-xl">
              <CardHeader>
                <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center mb-4">
                  <Zap className="w-6 h-6 text-primary" />
                </div>
                <CardTitle className="text-xl mb-2">Always Available</CardTitle>
                <CardDescription className="text-base">
                  Your AI agent works round the clock, responding to candidates
                  instantly
                </CardDescription>
              </CardHeader>
            </Card>
            <Card className="border-slate-200 dark:border-slate-800 bg-white/60 dark:bg-slate-900/60 backdrop-blur-xl shadow-xl">
              <CardHeader>
                <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center mb-4">
                  <Shield className="w-6 h-6 text-primary" />
                </div>
                <CardTitle className="text-xl mb-2">Smart Decisions</CardTitle>
                <CardDescription className="text-base">
                  Intelligently screens and ranks candidates based on your
                  requirements
                </CardDescription>
              </CardHeader>
            </Card>
            <Card className="border-slate-200 dark:border-slate-800 bg-white/60 dark:bg-slate-900/60 backdrop-blur-xl shadow-xl">
              <CardHeader>
                <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center mb-4">
                  <Users className="w-6 h-6 text-primary" />
                </div>
                <CardTitle className="text-xl mb-2">Personal Touch</CardTitle>
                <CardDescription className="text-base">
                  Sends personalized communications and handles candidate
                  queries
                </CardDescription>
              </CardHeader>
            </Card>
            <Card className="border-slate-200 dark:border-slate-800 bg-white/60 dark:bg-slate-900/60 backdrop-blur-xl shadow-xl">
              <CardHeader>
                <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center mb-4">
                  <Clock className="w-6 h-6 text-primary" />
                </div>
                <CardTitle className="text-xl mb-2">Lightning Fast</CardTitle>
                <CardDescription className="text-base">
                  Completes hiring workflows in hours instead of weeks
                </CardDescription>
              </CardHeader>
            </Card>
          </div>
          {/* Interactive Demo */}
          <div className="max-w-4xl mx-auto">
            {/* ... existing command block ... */}
          </div>
        </div>
      </section>

      {/* Social Proof & Testimonials */}
      <section className="py-24 bg-slate-50/50 dark:bg-slate-900/50">
        <div className="container mx-auto px-4">
          <h2 className="text-3xl font-bold text-center mb-16">
            What Our Customers Say
          </h2>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            {/* Testimonial Cards */}
            <div className="bg-white dark:bg-slate-800 p-6 rounded-xl shadow-sm">
              <div className="flex items-center gap-2 mb-4">
                {[1, 2, 3, 4, 5].map((n) => (
                  <Star
                    key={n}
                    className="w-4 h-4 fill-current text-amber-400"
                  />
                ))}
              </div>
              <p className="text-slate-600 dark:text-slate-300 mb-6">
                "Larkx transformed our hiring process. We've reduced our
                time-to-hire by 60% while improving candidate quality."
              </p>
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-full bg-slate-200 dark:bg-slate-700"></div>
                <div>
                  <p className="font-medium">Sarah Johnson</p>
                  <p className="text-sm text-muted-foreground">
                    HR Director, TechCorp
                  </p>
                </div>
              </div>
            </div>
            {/* Add more testimonials */}
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="py-24">
        <div className="container mx-auto px-4">
          <h2 className="text-3xl font-bold text-center mb-16">How It Works</h2>
          <div className="max-w-4xl mx-auto">
            <div className="relative">
              <div className="absolute left-12 top-0 bottom-0 w-0.5 bg-slate-200 dark:bg-slate-700"></div>
              <div className="space-y-12">
                {[
                  {
                    title: "Describe Your Needs",
                    desc: "Tell your AI agent what you're looking for in natural language",
                  },
                  {
                    title: "AI Creates Workflow",
                    desc: "Watch as complex hiring workflows are created instantly",
                  },
                  {
                    title: "Automated Processing",
                    desc: "Let AI handle screening, scheduling, and communication",
                  },
                  {
                    title: "Focus on Best Candidates",
                    desc: "Interview only the most qualified candidates",
                  },
                ].map((step, i) => (
                  <div key={i} className="relative flex gap-8">
                    <div className="w-24 h-24 rounded-full bg-primary/10 flex items-center justify-center shrink-0 z-10">
                      <span className="text-2xl font-bold text-primary">
                        {i + 1}
                      </span>
                    </div>
                    <div className="pt-6">
                      <h3 className="text-xl font-semibold mb-2">
                        {step.title}
                      </h3>
                      <p className="text-muted-foreground">{step.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Integrations */}
      <section className="py-24 bg-slate-50/50 dark:bg-slate-900/50">
        <div className="container mx-auto px-4">
          <h2 className="text-3xl font-bold text-center mb-6">
            Works With Your Stack
          </h2>
          <p className="text-center text-muted-foreground mb-16 max-w-2xl mx-auto">
            Seamlessly integrate with your existing HR tools and ATS systems
          </p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 max-w-4xl mx-auto">
            {/* Integration logos */}
          </div>
          <div className="text-center mt-16">
            <div className="inline-flex items-center gap-2 text-primary hover:text-primary/90">
              <span>View all integrations</span>
              <ArrowRight className="w-4 h-4" />
            </div>
          </div>
        </div>
      </section>

      {/* Security & Compliance */}
      <section className="py-24">
        <div className="container mx-auto px-4">
          <div className="max-w-4xl mx-auto">
            <h2 className="text-3xl font-bold text-center mb-6">
              Enterprise-Grade Security
            </h2>
            <p className="text-center text-muted-foreground mb-16">
              Your data is protected with industry-leading security measures
            </p>
            <div className="grid sm:grid-cols-3 gap-8">
              <div className="flex flex-col items-center text-center">
                <Lock className="w-8 h-8 text-primary mb-4" />
                <h3 className="font-semibold mb-2">SOC 2 Compliant</h3>
                <p className="text-sm text-muted-foreground">
                  Independently audited security controls
                </p>
              </div>
              <div className="flex flex-col items-center text-center">
                <Shield className="w-8 h-8 text-primary mb-4" />
                <h3 className="font-semibold mb-2">GDPR Ready</h3>
                <p className="text-sm text-muted-foreground">
                  Full data privacy compliance
                </p>
              </div>
              <div className="flex flex-col items-center text-center">
                <Code className="w-8 h-8 text-primary mb-4" />
                <h3 className="font-semibold mb-2">API Security</h3>
                <p className="text-sm text-muted-foreground">
                  Enterprise-grade encryption
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="relative py-24 overflow-hidden bg-slate-50 dark:bg-slate-900/50">
        <div className="absolute inset-0 bg-grid-slate-200/20 dark:bg-grid-slate-800/20 [mask-image:linear-gradient(0deg,transparent,black)]" />
        <div className="container relative mx-auto px-4 sm:px-6">
          <div className="relative">
            <div className="absolute -inset-x-0 -top-40 -bottom-40 overflow-hidden">
              <div className="absolute inset-x-0 inset-y-0 bg-gradient-to-br from-primary/30 via-purple-500/30 to-indigo-600/30 backdrop-blur-3xl">
                <div className="absolute inset-0 bg-slate-50 dark:bg-slate-900 [mask-image:radial-gradient(ellipse_at_center,transparent_50%,black)]"></div>
              </div>
            </div>
            <div className="relative mx-auto max-w-4xl">
              <div className="relative z-10 rounded-3xl bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl shadow-2xl shadow-slate-200/20 dark:shadow-slate-900/20 border border-slate-200/50 dark:border-slate-700/50 px-4 sm:px-6 py-12 sm:py-20">
                <div className="absolute inset-0 bg-gradient-to-br from-primary/[0.07] via-transparent to-purple-500/[0.07] rounded-3xl"></div>
                <div className="relative flex flex-col items-center text-center">
                  <span className="inline-flex items-center gap-2 px-4 py-1.5 mb-6 sm:mb-8 text-sm font-medium bg-primary/10 text-primary rounded-full ring-1 ring-primary/25">
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 16 16"
                      fill="none"
                      className="animate-pulse"
                    >
                      <circle
                        cx="8"
                        cy="8"
                        r="8"
                        fill="currentColor"
                        fillOpacity="0.2"
                      />
                      <circle cx="8" cy="8" r="3" fill="currentColor" />
                    </svg>
                    Ready to Transform Your Hiring?
                  </span>
                  <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold mb-4 sm:mb-6 leading-[1.2] bg-gradient-to-r from-gray-900 via-primary to-purple-600 dark:from-white dark:via-primary dark:to-purple-400 bg-clip-text text-transparent">
                    Transform Words into
                    <br className="hidden sm:block" />
                    Powerful Hiring Workflows
                  </h2>
                  <p className="text-lg sm:text-xl text-slate-600 dark:text-slate-300 max-w-2xl mx-auto mb-8 sm:mb-12 px-4">
                    Join forward-thinking companies using Larkx to automate
                    hiring with simple English instructions.
                  </p>
                  <div className="flex flex-col sm:flex-row gap-3 sm:gap-6 w-full max-w-md px-4">
                    <Button
                      size="lg"
                      className="w-full bg-primary hover:bg-primary/90 text-white px-6 sm:px-8 h-12 text-base font-medium shadow-lg shadow-primary/25 rounded-full"
                    >
                      Start Free Trial
                    </Button>
                    <Button
                      size="lg"
                      variant="outline"
                      className="w-full border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 h-12 px-6 sm:px-8 text-base rounded-full"
                    >
                      Schedule Demo
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
