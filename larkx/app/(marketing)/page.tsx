"use client"

import { Button } from "@/components/ui/button"
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Zap, Shield, Users, Clock } from "lucide-react"
import Link from "next/link"

export default function HomePage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white dark:from-slate-950 dark:to-slate-900">
      {/* Hero Section */}
      <section className="relative overflow-hidden bg-gradient-to-b from-primary/5 via-primary/[0.02] to-transparent">
        <div className="absolute inset-0 bg-grid-slate-200/20 dark:bg-grid-slate-800/20 [mask-image:linear-gradient(0deg,transparent,black)]" />
        <div className="container relative mx-auto px-4 sm:px-6 py-20 sm:py-32 flex flex-col items-center text-center">
          <div className="absolute inset-x-0 -top-40 -z-10 transform-gpu overflow-hidden blur-3xl sm:-top-80"
            aria-hidden="true">
            <div className="relative left-[calc(50%-11rem)] aspect-[1155/678] w-[36.125rem] -translate-x-1/2 rotate-[30deg] bg-gradient-to-tr from-primary to-purple-500 opacity-20 sm:left-[calc(50%-30rem)] sm:w-[72.1875rem]"></div>
          </div>
          <span className="relative inline-flex items-center px-4 sm:px-6 py-2 mb-6 sm:mb-8 text-sm font-semibold bg-gradient-to-r from-amber-100/80 to-yellow-100/80 text-amber-800 rounded-full ring-1 ring-amber-300/50 shadow-lg shadow-amber-200/20 backdrop-blur-sm">
            <div className="absolute -inset-0.5 bg-gradient-to-r from-amber-400/30 to-yellow-400/30 rounded-full blur-sm"></div>
            <div className="absolute inset-0 bg-gradient-to-r from-amber-100/80 to-yellow-100/80 rounded-full"></div>
            <span className="relative flex items-center gap-2">
              <svg className="w-4 h-4 text-amber-600" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M12 2L2 7L12 12L22 7L12 2Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M2 17L12 22L22 17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M2 12L12 17L22 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              Just Type, AI Does the Rest
            </span>
          </span>
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight mb-4 sm:mb-6 leading-[1.15] bg-gradient-to-r from-gray-900 to-gray-600 dark:from-white dark:to-gray-200 bg-clip-text text-transparent">
            Your AI Agent Creates<br className="hidden sm:block"/>
            <span className="bg-gradient-to-r from-primary to-purple-600 dark:from-primary dark:to-purple-400 bg-clip-text inline-block mt-1 sm:mt-2">Hiring Workflows</span><br className="hidden sm:block"/>
            <span className="inline-block mt-1 sm:mt-2">From Plain English</span>
          </h1>
          <p className="text-lg sm:text-xl text-muted-foreground max-w-2xl mb-8 sm:mb-12 px-4">
            Meet your AI recruitment assistant that turns simple instructions into powerful automation. No coding needed - just chat naturally.
          </p>
          <div className="flex flex-col items-center gap-6 sm:gap-8 w-full max-w-3xl mb-8 sm:mb-12 px-4">
            <div className="bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl p-4 sm:p-8 rounded-xl w-full border border-slate-200 dark:border-slate-800 shadow-2xl relative group">
              {/* Decorative elements */}
              <div className="absolute inset-0 bg-gradient-to-r from-primary/5 via-transparent to-purple-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-700 rounded-xl"></div>
              <div className="absolute -inset-px bg-gradient-to-r from-primary/20 via-transparent to-purple-500/20 rounded-xl opacity-0 group-hover:opacity-100 blur transition-opacity duration-700"></div>
              
              {/* Command input section */}
              <div className="relative">
                <div className="flex items-center gap-3 mb-3 sm:mb-4">
                  <div className="w-3 h-3 rounded-full bg-primary/20 animate-pulse"></div>
                  <p className="text-sm text-muted-foreground flex items-center gap-2">
                    You type in plain English
                    <span className="inline-block w-1.5 h-4 bg-primary/40 animate-blink"></span>
                  </p>
                </div>
                <div className="relative font-mono text-sm sm:text-base leading-relaxed text-slate-800 dark:text-slate-200 mb-6 sm:mb-8 transition-all duration-300">
                  <div className="absolute -left-4 top-0 bottom-0 w-1 bg-primary/20 rounded-full"></div>
                  <p className="group-hover:text-primary/90 transition-colors duration-300">
                    &ldquo;Hey Larkx, help me hire delivery drivers:&rdquo;
                  </p>
                  <div className="pl-4 mt-4 space-y-2">
                    <div className="flex items-center gap-2 opacity-0 animate-slideIn" style={{ animationDelay: '0.2s', animationFillMode: 'forwards' }}>
                      <span className="text-primary">1.</span> Screen new applications 24/7
                    </div>
                    <div className="flex items-center gap-2 opacity-0 animate-slideIn" style={{ animationDelay: '0.4s', animationFillMode: 'forwards' }}>
                      <span className="text-primary">2.</span> Check driver&apos;s license and experience
                    </div>
                    <div className="flex items-center gap-2 opacity-0 animate-slideIn" style={{ animationDelay: '0.6s', animationFillMode: 'forwards' }}>
                      <span className="text-primary">3.</span> Send personalized welcome messages
                    </div>
                    <div className="flex items-center gap-2 opacity-0 animate-slideIn" style={{ animationDelay: '0.8s', animationFillMode: 'forwards' }}>
                      <span className="text-primary">4.</span> Schedule interviews for qualified candidates
                    </div>
                  </div>
                </div>
              </div>

              {/* AI Response section */}
              <div className="relative">
                <div className="flex items-center gap-3 mb-3 sm:mb-4">
                  <div className="w-3 h-3 rounded-full bg-primary animate-ping"></div>
                  <p className="text-sm text-primary font-medium flex items-center gap-2">
                    AI Agent creates automation
                    <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/>
                    </svg>
                  </p>
                </div>
                <div className="bg-gradient-to-r from-slate-50/80 via-white/80 to-slate-50/80 dark:from-slate-800/80 dark:via-slate-900/80 dark:to-slate-800/80 rounded-lg p-4 sm:p-6 font-mono text-xs sm:text-sm">
                  <div className="space-y-3">
                    <div className="flex items-center gap-3 opacity-0 animate-fadeSlideUp" style={{ animationDelay: '1s', animationFillMode: 'forwards' }}>
                      <svg className="w-5 h-5 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      <span className="text-slate-700 dark:text-slate-300">Application monitoring workflow created</span>
                    </div>
                    <div className="flex items-center gap-3 opacity-0 animate-fadeSlideUp" style={{ animationDelay: '1.2s', animationFillMode: 'forwards' }}>
                      <svg className="w-5 h-5 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      <span className="text-slate-700 dark:text-slate-300">Document verification setup</span>
                    </div>
                    <div className="flex items-center gap-3 opacity-0 animate-fadeSlideUp" style={{ animationDelay: '1.4s', animationFillMode: 'forwards' }}>
                      <svg className="w-5 h-5 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      <span className="text-slate-700 dark:text-slate-300">Automated messaging configured</span>
                    </div>
                    <div className="flex items-center gap-3 opacity-0 animate-fadeSlideUp" style={{ animationDelay: '1.6s', animationFillMode: 'forwards' }}>
                      <svg className="w-5 h-5 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      <span className="text-slate-700 dark:text-slate-300">Smart scheduling system enabled</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Add required keyframes */}
          <style jsx global>{`
            @keyframes blink {
              0%, 100% { opacity: 0; }
              50% { opacity: 1; }
            }
            @keyframes slideIn {
              from { transform: translateX(-10px); opacity: 0; }
              to { transform: translateX(0); opacity: 1; }
            }
            @keyframes fadeSlideUp {
              from { transform: translateY(10px); opacity: 0; }
              to { transform: translateY(0); opacity: 1; }
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
              <Button size="lg" className="w-full bg-primary hover:bg-primary/90 text-white px-6 sm:px-8 h-12 text-base shadow-lg shadow-primary/25">
                Talk to Your AI Agent
              </Button>
            </Link>
            <Button size="lg" variant="outline" className="w-full border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 h-12 px-6 sm:px-8 text-base">
              Watch Demo
            </Button>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-16 sm:py-24 relative overflow-hidden">
        <div className="container mx-auto px-4 sm:px-6">
          <div className="absolute inset-x-0 top-0 -z-10 transform-gpu overflow-hidden blur-3xl sm:-top-80"
            aria-hidden="true">
            <div className="relative left-[calc(50%+3rem)] aspect-[1155/678] w-[36.125rem] -translate-x-1/2 bg-gradient-to-tr from-primary to-purple-500 opacity-10 sm:left-[calc(50%+36rem)] sm:w-[72.1875rem]"></div>
          </div>
          <h2 className="text-3xl sm:text-4xl font-bold text-center mb-3 sm:mb-4 bg-gradient-to-r from-gray-900 to-gray-600 dark:from-white dark:to-gray-200 bg-clip-text text-transparent">
            Natural Language to Automation
          </h2>
          <p className="text-center text-muted-foreground mb-12 sm:mb-16 max-w-2xl mx-auto text-base sm:text-lg px-4">
            Describe what you want in simple English - your AI agent converts it into powerful recruitment workflows
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-8 px-4">
            <Card className="border-slate-200 dark:border-slate-800 bg-white/60 dark:bg-slate-900/60 backdrop-blur-xl shadow-xl">
              <CardHeader>
                <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center mb-4">
                  <Zap className="w-6 h-6 text-primary" />
                </div>
                <CardTitle className="text-xl mb-2">Always Available</CardTitle>
                <CardDescription className="text-base">
                  Your AI agent works round the clock, responding to candidates instantly
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
                  Intelligently screens and ranks candidates based on your requirements
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
                  Sends personalized communications and handles candidate queries
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
        </div>
      </section>

      {/* CTA Section */}
      <section className="relative py-16 sm:py-24 overflow-hidden bg-slate-50 dark:bg-slate-900/50">
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
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="animate-pulse">
                      <circle cx="8" cy="8" r="8" fill="currentColor" fillOpacity="0.2"/>
                      <circle cx="8" cy="8" r="3" fill="currentColor"/>
                    </svg>
                    Ready to Transform Your Hiring?
                  </span>
                  <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold mb-4 sm:mb-6 leading-[1.2] bg-gradient-to-r from-gray-900 via-primary to-purple-600 dark:from-white dark:via-primary dark:to-purple-400 bg-clip-text text-transparent">
                    Transform Words into<br className="hidden sm:block"/>Powerful Hiring Workflows
                  </h2>
                  <p className="text-lg sm:text-xl text-slate-600 dark:text-slate-300 max-w-2xl mx-auto mb-8 sm:mb-12 px-4">
                    Join forward-thinking companies using Larkx to automate hiring with simple English instructions.
                  </p>
                  <div className="flex flex-col sm:flex-row gap-3 sm:gap-6 w-full max-w-md px-4">
                    <Button size="lg" className="w-full bg-primary hover:bg-primary/90 text-white px-6 sm:px-8 h-12 text-base font-medium shadow-lg shadow-primary/25 rounded-full">
                      Start Free Trial
                    </Button>
                    <Button size="lg" variant="outline" className="w-full border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 h-12 px-6 sm:px-8 text-base rounded-full">
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
  )
}