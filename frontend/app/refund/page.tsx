"use client";

import React from "react";
import Link from "next/link";
import { Sparkles } from "lucide-react";

export default function RefundPage() {
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

      {/* Refund Content */}
      <section className="container mx-auto px-4 py-12 max-w-4xl">
        <h1 className="text-4xl font-bold mb-8">Refund Policy</h1>
        <p className="text-slate-400 mb-8">Last updated: {new Date().toLocaleDateString()}</p>

        <div className="prose prose-invert max-w-none space-y-8">
          <section>
            <h2 className="text-2xl font-semibold text-slate-100 mb-4">1. 30-Day Money-Back Guarantee</h2>
            <p className="text-slate-300 leading-relaxed">
              We offer a 30-day money-back guarantee for all paid subscriptions. If you&apos;re not satisfied with our service within the first 30 days of your subscription, you can request a full refund.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-slate-100 mb-4">2. Eligibility for Refunds</h2>
            <p className="text-slate-300 leading-relaxed mb-4">
              To be eligible for a refund, you must:
            </p>
            <ul className="list-disc list-inside text-slate-300 space-y-2">
              <li>Request the refund within 30 days of your initial subscription</li>
              <li>Not have used the service for more than 3 app submissions</li>
              <li>Provide a valid reason for the refund request</li>
              <li>Have an active account in good standing</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-slate-100 mb-4">3. How to Request a Refund</h2>
            <p className="text-slate-300 leading-relaxed mb-4">
              To request a refund, please:
            </p>
            <ol className="list-decimal list-inside text-slate-300 space-y-2">
              <li>Contact our support team at support@larkx.ai</li>
              <li>Include your account email and subscription details</li>
              <li>Provide a brief explanation for your refund request</li>
              <li>We will process your request within 5 business days</li>
            </ol>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-slate-100 mb-4">4. Refund Processing</h2>
            <p className="text-slate-300 leading-relaxed">
              Approved refunds will be processed to the original payment method within 5-10 business days. The refund amount will be the full amount paid for the subscription period, minus any usage-based charges if applicable.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-slate-100 mb-4">5. Non-Refundable Items</h2>
            <p className="text-slate-300 leading-relaxed mb-4">
              The following are not eligible for refunds:
            </p>
            <ul className="list-disc list-inside text-slate-300 space-y-2">
              <li>Free plan usage (no payment made)</li>
              <li>Refund requests made after 30 days</li>
              <li>Accounts that have been terminated for violations</li>
              <li>Third-party fees (app store fees, payment processing fees)</li>
              <li>Custom development or consulting services</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-slate-100 mb-4">6. Subscription Cancellation</h2>
            <p className="text-slate-300 leading-relaxed">
              You can cancel your subscription at any time from your account settings. Cancellation will take effect at the end of your current billing period. You will retain access to paid features until the end of your billing cycle.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-slate-100 mb-4">7. Partial Refunds</h2>
            <p className="text-slate-300 leading-relaxed">
              In certain circumstances, we may offer partial refunds for unused portions of your subscription. This is evaluated on a case-by-case basis and depends on your usage patterns and the reason for cancellation.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-slate-100 mb-4">8. Disputes and Chargebacks</h2>
            <p className="text-slate-300 leading-relaxed">
              If you initiate a chargeback or dispute with your payment provider, we may suspend your account pending resolution. We encourage you to contact us directly first, as we can often resolve issues more quickly than through payment disputes.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-slate-100 mb-4">9. Service Interruptions</h2>
            <p className="text-slate-300 leading-relaxed">
              If our service experiences significant downtime (more than 24 hours) due to technical issues on our end, we may offer service credits or refunds for the affected period. This does not apply to planned maintenance or third-party service outages.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-slate-100 mb-4">10. Changes to Refund Policy</h2>
            <p className="text-slate-300 leading-relaxed">
              We reserve the right to modify this refund policy at any time. Changes will be posted on this page with an updated &quot;Last updated&quot; date. Your continued use of our service after any modifications constitutes acceptance of the updated policy.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-slate-100 mb-4">11. Contact Information</h2>
            <p className="text-slate-300 leading-relaxed">
              For refund requests or questions about this policy, please contact us at:
            </p>
            <div className="mt-4 text-slate-300">
              <p>Email: support@larkx.ai</p>
              <p>Subject: Refund Request</p>
              <p>Response Time: Within 24 hours</p>
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
            <Link href="/terms" className="hover:text-white">
              Terms
            </Link>
            <Link href="/privacy" className="hover:text-white">
              Privacy
            </Link>
          </div>
        </div>
      </footer>
    </main>
  );
}
