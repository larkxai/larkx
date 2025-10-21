"use client";

import React from "react";
import Link from "next/link";
import { Sparkles } from "lucide-react";

export default function TermsPage() {
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
        </div>
      </nav>

      {/* Terms Content */}
      <section className="container mx-auto px-4 py-12 max-w-4xl">
        <h1 className="text-4xl font-bold mb-8">Terms of Service</h1>
        <p className="text-slate-400 mb-8">Last updated: {new Date().toLocaleDateString()}</p>

        <div className="prose prose-invert max-w-none space-y-8">
          <section>
            <h2 className="text-2xl font-semibold text-slate-100 mb-4">1. Acceptance of Terms</h2>
            <p className="text-slate-300 leading-relaxed">
              By accessing and using Larkx ("the Service"), you accept and agree to be bound by the terms and provision of this agreement. If you do not agree to abide by the above, please do not use this service.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-slate-100 mb-4">2. Description of Service</h2>
            <p className="text-slate-300 leading-relaxed">
              Larkx is an AI-powered platform that automates mobile app submissions to iOS App Store and Google Play Store. Our service includes but is not limited to:
            </p>
            <ul className="list-disc list-inside text-slate-300 mt-4 space-y-2">
              <li>Automated app store submissions</li>
              <li>AI-generated content (descriptions, screenshots, metadata)</li>
              <li>Rejection handling and optimization</li>
              <li>Multi-store synchronization</li>
              <li>Dashboard for managing app releases</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-slate-100 mb-4">3. User Accounts</h2>
            <p className="text-slate-300 leading-relaxed">
              To use our service, you must create an account. You are responsible for maintaining the confidentiality of your account and password. You agree to accept responsibility for all activities that occur under your account.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-slate-100 mb-4">4. Acceptable Use</h2>
            <p className="text-slate-300 leading-relaxed mb-4">
              You agree not to use the Service to:
            </p>
            <ul className="list-disc list-inside text-slate-300 space-y-2">
              <li>Submit apps that violate app store guidelines</li>
              <li>Submit malicious, illegal, or harmful content</li>
              <li>Attempt to gain unauthorized access to our systems</li>
              <li>Use the service for any unlawful purpose</li>
              <li>Interfere with or disrupt the service</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-slate-100 mb-4">5. Payment Terms</h2>
            <p className="text-slate-300 leading-relaxed">
              Our service offers both free and paid plans. Paid subscriptions are billed monthly or annually as selected. All fees are non-refundable except as required by law. We reserve the right to change our pricing with 30 days notice.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-slate-100 mb-4">6. Intellectual Property</h2>
            <p className="text-slate-300 leading-relaxed">
              You retain ownership of your app content and intellectual property. By using our service, you grant us a limited license to process and submit your content to app stores on your behalf. We retain all rights to our platform, technology, and AI models.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-slate-100 mb-4">7. Limitation of Liability</h2>
            <p className="text-slate-300 leading-relaxed">
              Larkx is provided "as is" without warranties of any kind. We are not responsible for app store rejections, delays, or policy changes. Our liability is limited to the amount you paid for the service in the 12 months preceding the claim.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-slate-100 mb-4">8. Termination</h2>
            <p className="text-slate-300 leading-relaxed">
              We may terminate or suspend your account at any time for violation of these terms. You may cancel your subscription at any time. Upon termination, your access to the service will cease immediately.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-slate-100 mb-4">9. Changes to Terms</h2>
            <p className="text-slate-300 leading-relaxed">
              We reserve the right to modify these terms at any time. We will notify users of significant changes via email or through the service. Continued use of the service constitutes acceptance of the modified terms.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-slate-100 mb-4">10. Contact Information</h2>
            <p className="text-slate-300 leading-relaxed">
              If you have any questions about these Terms of Service, please contact us at:
            </p>
            <div className="mt-4 text-slate-300">
              <p>Email: legal@larkx.ai</p>
              <p>Address: [Your Company Address]</p>
            </div>
          </section>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/10">
        <div className="container mx-auto px-4 py-10 flex flex-col md:flex-row items-center justify-between gap-4">
          <p className="text-slate-400 text-sm">
            © {new Date().getFullYear()} Larkx. All rights reserved.
          </p>
          <div className="flex items-center gap-6 text-sm text-slate-400">
            <Link href="/pricing" className="hover:text-white">
              Pricing
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
