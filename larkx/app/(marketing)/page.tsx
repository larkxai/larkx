"use client"

import { Button } from "@/components/ui/button"
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Zap, Shield, Users, Clock } from "lucide-react"
import Link from "next/link"

export default function HomePage() {
  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="container mx-auto px-6 py-4 flex justify-end">
        <Link href="/app/dashboard">
          <Button variant="ghost">Login</Button>
        </Link>
      </header>

      {/* Hero Section */}
      <section className="container mx-auto px-6 py-24 flex flex-col items-center text-center">
        <h1 className="text-5xl font-bold tracking-tight mb-6">
          Streamline Your Hiring Process with{" "}
          <span className="text-primary">Larkx</span>
        </h1>
        <p className="text-xl text-muted-foreground max-w-2xl mb-8">
          The intelligent hiring platform that helps you find, evaluate, and hire the best talent faster than ever before.
        </p>
        <div className="flex gap-4">
          <Button size="lg">Get Started</Button>
          <Button size="lg" variant="outline">Book a Demo</Button>
        </div>
      </section>

      {/* Features Section */}
      <section className="container mx-auto px-6 py-24 bg-secondary/10">
        <h2 className="text-3xl font-bold text-center mb-12">Why Choose Larkx</h2>
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
          <Card>
            <CardHeader>
              <Zap className="w-10 h-10 text-primary mb-2" />
              <CardTitle>Fast & Efficient</CardTitle>
              <CardDescription>
                Reduce your time-to-hire by up to 50% with our AI-powered platform
              </CardDescription>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader>
              <Shield className="w-10 h-10 text-primary mb-2" />
              <CardTitle>Secure & Compliant</CardTitle>
              <CardDescription>
                Enterprise-grade security and compliance built into every feature
              </CardDescription>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader>
              <Users className="w-10 h-10 text-primary mb-2" />
              <CardTitle>Team Collaboration</CardTitle>
              <CardDescription>
                Seamless collaboration tools for your entire hiring team
              </CardDescription>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader>
              <Clock className="w-10 h-10 text-primary mb-2" />
              <CardTitle>Time-Saving</CardTitle>
              <CardDescription>
                Automated workflows and scheduling to save you precious time
              </CardDescription>
            </CardHeader>
          </Card>
        </div>
      </section>

      {/* CTA Section */}
      <section className="container mx-auto px-6 py-24 text-center">
        <h2 className="text-3xl font-bold mb-6">Ready to Transform Your Hiring?</h2>
        <p className="text-xl text-muted-foreground max-w-2xl mx-auto mb-8">
          Join thousands of companies already using Larkx to build their dream teams.
        </p>
        <Button size="lg" className="px-8">Start Free Trial</Button>
      </section>
    </div>
  )
}