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
  ArrowRight,
  Star,
  Lock,
  Code,
} from "lucide-react";
import { useAuthStore } from "@/lib/store/auth";
import { useRouter } from "next/navigation";

export default function HomePage() {
  const messages = [
    {
      type: "user",
      text: "I need to hire a senior frontend developer. Can you help set up the hiring process?",
      delay: 0.2,
    },
    {
      type: "ai",
      text: "I'll help you set up the FormAgent to collect applications. What information should we gather from candidates?",
      delay: 0.4,
    },
    {
      type: "user",
      text: "We need their experience, React skills, and portfolio. Also, they should have 5+ years of experience.",
      delay: 0.6,
    },
    {
      type: "ai",
      text: "I've configured the FormAgent with those requirements. The ReminderAgent will automatically follow up with candidates who haven't completed their application within 48 hours.",
      delay: 0.8,
    },
    {
      type: "user",
      text: "Great! Can you also set up automated screening?",
      delay: 1.0,
    },
    {
      type: "ai",
      text: "I'll add a ScreeningAgent that evaluates candidates based on your criteria. It will automatically rank applications and notify you of the best matches.",
      delay: 1.2,
    },
  ];

  const user = useAuthStore((state) => state.user);
  const router = useRouter();

  const handleCTAClick = (e) => {
    e.preventDefault();
    if (user) {
      router.push("/app/dashboard");
    } else {
      router.push("/login");
    }
  };

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
              AI Agents for Smart Hiring
            </span>
            <span className="inline-block mt-4 sm:mt-5 text-3xl sm:text-4xl lg:text-5xl bg-gradient-to-br from-gray-800 to-gray-900 dark:from-gray-100 dark:to-gray-200 bg-clip-text">
              Modular & Extensible Platform
            </span>
          </h1>
          <p className="text-lg sm:text-xl lg:text-2xl text-muted-foreground/90 max-w-2xl mb-10 sm:mb-14 px-4 leading-relaxed font-medium">
            <span className="inline-block w-full animate-typing-text">
              Create intelligent hiring agents that work proactively, adapt to your needs, and learn from every interaction.
            </span>
          </p>
          <div className="flex flex-col items-center w-full mb-8 sm:mb-12">
            <div className="relative w-full">
              {/* Split Layout */}
              <div className="grid grid-cols-1 lg:grid-cols-2 min-h-[800px] gap-4">
                {/* Left Side - Messages */}
                <div className="p-8 sm:p-10 border border-slate-200 dark:border-slate-700 rounded-3xl bg-white/50 dark:bg-slate-900/50">
                  <div className="flex flex-col h-full">
                    <div className="flex items-center gap-3 mb-6">
                      <div className="w-3 h-3 rounded-full bg-amber-400/80"></div>
                      <p className="text-sm font-medium text-amber-700 dark:text-amber-300">
                        Chat with Your AI Agent
                      </p>
                    </div>

                    {/* Messages Container */}
                    <div className="flex-1 space-y-6 overflow-y-auto">
                      {messages.map((message, index) => (
                        <div key={index} className="relative group">
                          {message.type === "user" ? (
                            <>
                              <div className="absolute -left-2 top-3 w-4 h-4 rounded-full bg-primary/10"></div>
                              <div className="pl-4 space-y-1.5">
                                <p className="text-sm text-slate-500 dark:text-slate-400">
                                  You
                                </p>
                                <div className="text-sm sm:text-base text-slate-900 dark:text-white">
                                  {message.text}
                                </div>
                              </div>
                            </>
                          ) : (
                            <div className="relative group pl-4">
                              <div className="space-y-1.5">
                                <p className="text-sm text-primary">AI Agent</p>
                                <div className="text-sm sm:text-base text-slate-900 dark:text-white">
                                  {message.text}
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>

                    {/* Input Area */}
                    <div className="mt-6">
                      <div className="flex items-end gap-4">
                        <div className="flex-1 min-h-[2.5rem] border border-slate-200 dark:border-slate-700 rounded-lg px-4 py-2 focus-within:ring-2 ring-primary/50">
                          <div className="text-slate-400 dark:text-slate-500 min-h-[1.5rem]">
                            Type your instructions...
                          </div>
                        </div>
                        <Button
                          size="icon"
                          className="h-10 w-10 rounded-lg bg-primary hover:bg-primary/90"
                        >
                          <ArrowRight className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Right Side - Agent System Visualization */}
                <div className="p-8 sm:p-10 border border-slate-200 dark:border-slate-700 rounded-3xl bg-white/50 dark:bg-slate-900/50 overflow-hidden">
                  <div className="relative h-full">
                    <div className="transform-gpu">
                      {/* FormAgent Node */}
                      <div className="relative flex flex-col items-center">
                        <div className="w-64 p-4 bg-white dark:bg-slate-900 rounded-xl shadow-sm ring-1 ring-slate-100/80 dark:ring-slate-800/80 text-center">
                          <div className="text-sm sm:text-base font-medium mb-2">
                            FormAgent
                          </div>
                          <div className="text-sm text-slate-500 dark:text-slate-400">
                            Collects & Validates Applications
                          </div>
                        </div>

                        {/* Connecting Line */}
                        <div className="h-12 w-px bg-slate-200/70 dark:bg-slate-700/70 my-4"></div>
                      </div>

                      {/* ReminderAgent Node */}
                      <div className="relative flex flex-col items-center">
                        <div className="w-72 p-4 bg-slate-50 dark:bg-slate-800/80 rounded-xl shadow-sm ring-1 ring-slate-100/80 dark:ring-slate-800/80">
                          <div className="text-sm sm:text-base text-slate-500 dark:text-slate-400 mb-1 font-medium">
                            ReminderAgent
                          </div>
                          <div className="text-sm sm:text-base">
                            Proactive Follow-ups & Engagement
                          </div>
                        </div>

                        {/* Split Lines */}
                        <div className="relative h-16 w-full mt-4">
                          <div className="absolute left-1/2 h-full w-px border-l border-slate-200/70 dark:border-slate-700/70 border-dashed transform -translate-x-1/2"></div>
                          <div className="absolute top-1/2 left-1/4 right-1/4 h-px border-t border-slate-200/70 dark:border-slate-700/70 border-dashed"></div>
                        </div>
                      </div>

                      {/* Screening and Evaluation Nodes */}
                      <div className="grid grid-cols-2 gap-16 mt-4">
                        {/* Left Branch - Active Screening */}
                        <div className="flex flex-col items-center">
                          <div className="w-64 p-4 bg-white dark:bg-slate-900 rounded-xl shadow-sm ring-1 ring-slate-100/80 dark:ring-slate-800/80 text-center">
                            ScreeningAgent
                          </div>

                          {/* Connecting Line */}
                          <div className="h-12 w-px bg-slate-200/70 dark:bg-slate-700/70 my-4"></div>

                          <div className="w-64 p-4 bg-white dark:bg-slate-900 rounded-xl shadow-sm ring-1 ring-slate-100/80 dark:ring-slate-800/80 text-center">
                            Smart Evaluation
                          </div>

                          {/* Split Lines */}
                          <div className="relative h-16 w-full mt-4">
                            <div className="absolute left-1/2 h-full w-px border-l border-slate-200/70 dark:border-slate-700/70 border-dashed transform -translate-x-1/2"></div>
                            <div className="absolute top-1/2 left-1/4 right-1/4 h-px border-t border-slate-200/70 dark:border-slate-700/70 border-dashed"></div>
                          </div>

                          {/* Evaluation Results */}
                          <div className="grid grid-cols-2 gap-8 w-full">
                            <div className="flex flex-col items-center">
                              <div className="w-full p-4 bg-emerald-50/50 dark:bg-emerald-900/20 rounded-xl shadow-sm ring-1 ring-emerald-100 dark:ring-emerald-800/50 text-center">
                                <div className="text-sm text-emerald-600 dark:text-emerald-400">
                                  Qualified
                                </div>
                                <div className="text-sm">
                                  Auto-schedule Interview
                                </div>
                              </div>

                              {/* Continue to Interview */}
                              <div className="h-12 w-px bg-slate-200/70 dark:bg-slate-700/70 my-4"></div>

                              <div className="w-full p-4 bg-white dark:bg-slate-900 rounded-xl shadow-sm ring-1 ring-slate-100/80 dark:ring-slate-800/80 text-center">
                                InterviewAgent
                              </div>

                              {/* Split Lines for Interview */}
                              <div className="relative h-16 w-full mt-4">
                                <div className="absolute left-1/2 h-full w-px border-l border-slate-200/70 dark:border-slate-700/70 border-dashed transform -translate-x-1/2"></div>
                                <div className="absolute top-1/2 left-1/4 right-1/4 h-px border-t border-slate-200/70 dark:border-slate-700/70 border-dashed"></div>
                              </div>

                              {/* Interview Results */}
                              <div className="grid grid-cols-2 gap-4 w-full">
                                <div className="flex flex-col items-center">
                                  <div className="w-full p-4 bg-emerald-50/50 dark:bg-emerald-900/20 rounded-xl shadow-sm ring-1 ring-emerald-100 dark:ring-emerald-800/50 text-center flex flex-col items-center">
                                    <span className="text-sm font-semibold text-emerald-600 dark:text-emerald-400 mb-1">Passed</span>
                                    <span className="text-sm font-medium">OfferAgent Activated</span>
                                  </div>
                                </div>
                                <div className="flex flex-col items-center">
                                  <div className="w-full p-4 bg-rose-50/50 dark:bg-rose-900/20 rounded-xl shadow-sm ring-1 ring-rose-100 dark:ring-rose-800/50 text-center flex flex-col items-center">
                                    <span className="text-sm font-semibold text-rose-600 dark:text-rose-400 mb-1">Not a Fit</span>
                                    <span className="text-sm font-medium">Auto-rejection</span>
                                  </div>
                                </div>
                              </div>
                            </div>

                            {/* Not Qualified */}
                            <div className="flex flex-col items-center">
                              <div className="w-full p-4 bg-rose-50/50 dark:bg-rose-900/20 rounded-xl shadow-sm ring-1 ring-rose-100 dark:ring-rose-800/50 text-center">
                                <div className="text-sm text-rose-600 dark:text-rose-400">
                                  Not Qualified
                                </div>
                                <div className="text-sm">Auto-rejection</div>
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Right Branch - Continuous Learning */}
                        <div className="flex flex-col items-center">
                          <div className="w-64 p-4 bg-blue-50/50 dark:bg-blue-900/20 rounded-xl shadow-sm ring-1 ring-blue-100 dark:ring-blue-800/50 text-center">
                            <div className="text-sm text-blue-600 dark:text-blue-400">
                              LearningAgent
                            </div>
                            <div className="text-sm">Improves with Every Interaction</div>
                          </div>
                        </div>
                      </div>
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
            @keyframes typing {
              from {
                clip-path: inset(0 100% 0 0);
              }
              to {
                clip-path: inset(0 0 0 0);
              }
            }
            @keyframes typing-text {
              from {
                width: 0;
                border-right: 2px solid currentColor;
              }
              to {
                width: 100%;
                border-right: 2px solid currentColor;
              }
            }
            @keyframes blink-caret {
              from,
              to {
                border-color: transparent;
              }
              50% {
                border-color: currentColor;
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
            .animate-typing {
              animation: typing 2s steps(50, end);
            }
            .animate-typing-text {
              display: inline-block;
              overflow: hidden;
              white-space: nowrap;
              border-right: 2px solid currentColor;
              width: 0;
              animation: typing-text 2.5s steps(80) forwards,
                blink-caret 0.75s step-end infinite;
            }
          `}</style>
          <div className="flex flex-col sm:flex-row gap-3 sm:gap-6 w-full max-w-md px-4">
            <Button
              size="lg"
              className="w-full font-semibold"
              onClick={handleCTAClick}
            >
              Talk to Your AI Agent
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
              Traditional hiring is slow and manual. Our intelligent agents work proactively to find, screen, and engage the best candidates.
            </p>
            <div className="grid sm:grid-cols-3 gap-8">
              <div className="flex flex-col items-center p-6 rounded-lg bg-white dark:bg-slate-800 shadow-sm">
                <Clock className="w-8 h-8 text-primary mb-4" />
                <h3 className="font-semibold mb-2">Proactive Agents</h3>
                <p className="text-sm text-muted-foreground">
                  Agents work independently to find and engage candidates
                </p>
              </div>
              <div className="flex flex-col items-center p-6 rounded-lg bg-white dark:bg-slate-800 shadow-sm">
                <Users className="w-8 h-8 text-primary mb-4" />
                <h3 className="font-semibold mb-2">Smart Screening</h3>
                <p className="text-sm text-muted-foreground">
                  AI-powered evaluation of candidates
                </p>
              </div>
              <div className="flex flex-col items-center p-6 rounded-lg bg-white dark:bg-slate-800 shadow-sm">
                <Zap className="w-8 h-8 text-primary mb-4" />
                <h3 className="font-semibold mb-2">Adaptive Learning</h3>
                <p className="text-sm text-muted-foreground">
                  Agents improve with every interaction
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
            Powerful Agent System
          </h2>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8 mb-16">
            <Card className="border-slate-200 dark:border-slate-800 bg-white/60 dark:bg-slate-900/60 backdrop-blur-xl shadow-xl">
              <CardHeader>
                <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center mb-4">
                  <Code className="w-6 h-6 text-primary" />
                </div>
                <CardTitle className="text-xl mb-2">FormAgent</CardTitle>
                <CardDescription className="text-base">
                  Collect and validate candidate information with dynamic forms
                </CardDescription>
              </CardHeader>
            </Card>
            <Card className="border-slate-200 dark:border-slate-800 bg-white/60 dark:bg-slate-900/60 backdrop-blur-xl shadow-xl">
              <CardHeader>
                <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center mb-4">
                  <Clock className="w-6 h-6 text-primary" />
                </div>
                <CardTitle className="text-xl mb-2">ReminderAgent</CardTitle>
                <CardDescription className="text-base">
                  Automated follow-ups and engagement with candidates
                </CardDescription>
              </CardHeader>
            </Card>
            <Card className="border-slate-200 dark:border-slate-800 bg-white/60 dark:bg-slate-900/60 backdrop-blur-xl shadow-xl">
              <CardHeader>
                <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center mb-4">
                  <Shield className="w-6 h-6 text-primary" />
                </div>
                <CardTitle className="text-xl mb-2">AgentOrchestrator</CardTitle>
                <CardDescription className="text-base">
                  Smart coordination between agents for seamless hiring
                </CardDescription>
              </CardHeader>
            </Card>
          </div>
          {/* Interactive Demo */}
          <div className="max-w-4xl mx-auto">
            {/* Remove duplicated graph block */}
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
                &quot;Larkx transformed our hiring process. We&apos;ve reduced
                our time-to-hire by 60% while improving candidate quality.&quot;
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
                    title: "Configure Agents",
                    desc: "Set up FormAgent, ReminderAgent, and other specialized agents",
                  },
                  {
                    title: "Agent Registry",
                    desc: "Register and manage your custom agents in the central registry",
                  },
                  {
                    title: "Smart Orchestration",
                    desc: "Let the AgentOrchestrator manage the flow between agents",
                  },
                  {
                    title: "Extensible Platform",
                    desc: "Build and integrate your own custom agents as needed",
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

      {/* Why Choose Agent-Based Hiring? */}
      <section className="py-24 bg-slate-50/50 dark:bg-slate-900/50">
        <div className="container mx-auto px-4">
          <h2 className="text-3xl font-bold text-center mb-16">
            Why Choose Agent-Based Hiring?
          </h2>
          <div className="grid md:grid-cols-2 gap-8 max-w-5xl mx-auto">
            <div className="space-y-6">
              <h3 className="text-xl font-semibold text-primary mb-4">Agent Management System</h3>
              <div className="space-y-4">
                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-1">
                    <svg className="w-4 h-4 text-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </div>
                  <div>
                    <p className="font-medium">Proactive Agents</p>
                    <p className="text-sm text-muted-foreground">Agents act independently and make smart decisions</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-1">
                    <svg className="w-4 h-4 text-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </div>
                  <div>
                    <p className="font-medium">Modular & Flexible</p>
                    <p className="text-sm text-muted-foreground">Add or swap agents without rebuilding workflows</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-1">
                    <svg className="w-4 h-4 text-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </div>
                  <div>
                    <p className="font-medium">Smart Interactions</p>
                    <p className="text-sm text-muted-foreground">AI-powered chat, voice, and natural language processing</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-1">
                    <svg className="w-4 h-4 text-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </div>
                  <div>
                    <p className="font-medium">Self-Optimizing</p>
                    <p className="text-sm text-muted-foreground">Agents learn and adapt from every interaction</p>
                  </div>
                </div>
              </div>
            </div>
            <div className="space-y-6">
              <h3 className="text-xl font-semibold text-slate-400 mb-4">Traditional Workflows</h3>
              <div className="space-y-4">
                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center shrink-0 mt-1">
                    <svg className="w-4 h-4 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M6 18L18 6M6 6l12 12" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </div>
                  <div>
                    <p className="font-medium">Passive Steps</p>
                    <p className="text-sm text-muted-foreground">Steps wait for manual input or triggers</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center shrink-0 mt-1">
                    <svg className="w-4 h-4 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M6 18L18 6M6 6l12 12" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </div>
                  <div>
                    <p className="font-medium">Rigid Structure</p>
                    <p className="text-sm text-muted-foreground">Flows must be rebuilt for any change</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center shrink-0 mt-1">
                    <svg className="w-4 h-4 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M6 18L18 6M6 6l12 12" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </div>
                  <div>
                    <p className="font-medium">Limited Interaction</p>
                    <p className="text-sm text-muted-foreground">Forms and scripted flows only</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center shrink-0 mt-1">
                    <svg className="w-4 h-4 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M6 18L18 6M6 6l12 12" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </div>
                  <div>
                    <p className="font-medium">Static Logic</p>
                    <p className="text-sm text-muted-foreground">No learning or adaptation over time</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="relative py-24 overflow-hidden dark:bg-slate-900/50">
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
                      className="w-full font-semibold"
                      onClick={handleCTAClick}
                    >
                      Start Free Trial
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
