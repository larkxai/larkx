"use client";

import React from "react";
import Link from "next/link";
import { Sparkles } from "lucide-react";

export default function PrivacyPage() {
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

      {/* Privacy Content */}
      <section className="container mx-auto px-4 py-12 max-w-4xl">
        <h1 className="text-4xl font-bold mb-8">Privacy Policy</h1>
        <p className="text-slate-400 mb-8">Last updated: {new Date().toLocaleDateString()}</p>

        <div className="prose prose-invert max-w-none space-y-8">
          <section>
            <h2 className="text-2xl font-semibold text-slate-100 mb-4">1. Information We Collect</h2>
            <p className="text-slate-300 leading-relaxed mb-4">
              We collect information you provide directly to us, such as when you create an account, use our services, or contact us for support.
            </p>
            <h3 className="text-xl font-semibold text-slate-100 mb-3">Personal Information:</h3>
            <ul className="list-disc list-inside text-slate-300 space-y-2">
              <li>Name and email address</li>
              <li>Account credentials</li>
              <li>Payment information (processed securely by our payment providers)</li>
              <li>App store credentials (Apple Developer, Google Play Console)</li>
            </ul>
            
            <h3 className="text-xl font-semibold text-slate-100 mb-3 mt-6">App Content:</h3>
            <ul className="list-disc list-inside text-slate-300 space-y-2">
              <li>App builds (.ipa, .aab files)</li>
              <li>App metadata and descriptions</li>
              <li>Screenshots and promotional materials</li>
              <li>App store submission data</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-slate-100 mb-4">2. How We Use Your Information</h2>
            <p className="text-slate-300 leading-relaxed mb-4">
              We use the information we collect to:
            </p>
            <ul className="list-disc list-inside text-slate-300 space-y-2">
              <li>Provide, maintain, and improve our services</li>
              <li>Process app store submissions on your behalf</li>
              <li>Generate AI-powered content for your apps</li>
              <li>Communicate with you about your account and services</li>
              <li>Send you technical notices and support messages</li>
              <li>Detect, prevent, and address technical issues</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-slate-100 mb-4">3. Information Sharing</h2>
            <p className="text-slate-300 leading-relaxed mb-4">
              We do not sell, trade, or otherwise transfer your personal information to third parties except in the following circumstances:
            </p>
            <ul className="list-disc list-inside text-slate-300 space-y-2">
              <li><strong>App Store Submissions:</strong> We share your app content with Apple and Google as necessary to submit your apps</li>
              <li><strong>Service Providers:</strong> We may share information with trusted third parties who assist us in operating our platform</li>
              <li><strong>Legal Requirements:</strong> We may disclose information if required by law or to protect our rights</li>
              <li><strong>Business Transfers:</strong> In the event of a merger or acquisition, user information may be transferred</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-slate-100 mb-4">4. Data Security</h2>
            <p className="text-slate-300 leading-relaxed">
              We implement appropriate security measures to protect your personal information against unauthorized access, alteration, disclosure, or destruction. This includes encryption of data in transit and at rest, secure authentication, and regular security audits.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-slate-100 mb-4">5. Data Retention</h2>
            <p className="text-slate-300 leading-relaxed">
              We retain your information for as long as your account is active or as needed to provide you services. We may retain certain information for longer periods for legitimate business purposes, legal compliance, or dispute resolution.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-slate-100 mb-4">6. Your Rights</h2>
            <p className="text-slate-300 leading-relaxed mb-4">
              Depending on your location, you may have the following rights regarding your personal information:
            </p>
            <ul className="list-disc list-inside text-slate-300 space-y-2">
              <li>Access and receive a copy of your personal information</li>
              <li>Correct inaccurate or incomplete information</li>
              <li>Delete your personal information</li>
              <li>Restrict or object to certain processing</li>
              <li>Data portability</li>
              <li>Withdraw consent where applicable</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-slate-100 mb-4">7. Cookies and Tracking</h2>
            <p className="text-slate-300 leading-relaxed">
              We use cookies and similar technologies to enhance your experience, analyze usage patterns, and improve our services. You can control cookie settings through your browser preferences.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-slate-100 mb-4">8. International Transfers</h2>
            <p className="text-slate-300 leading-relaxed">
              Your information may be transferred to and processed in countries other than your own. We ensure appropriate safeguards are in place to protect your information in accordance with applicable data protection laws.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-slate-100 mb-4">9. Children&apos;s Privacy</h2>
            <p className="text-slate-300 leading-relaxed">
              Our service is not intended for children under 13 years of age. We do not knowingly collect personal information from children under 13. If we become aware that we have collected personal information from a child under 13, we will take steps to delete such information.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-slate-100 mb-4">10. Changes to This Policy</h2>
            <p className="text-slate-300 leading-relaxed">
              We may update this Privacy Policy from time to time. We will notify you of any material changes by posting the new Privacy Policy on this page and updating the &quot;Last updated&quot; date. Your continued use of our service after any modifications constitutes acceptance of the updated policy.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-slate-100 mb-4">11. Contact Us</h2>
            <p className="text-slate-300 leading-relaxed">
              If you have any questions about this Privacy Policy or our privacy practices, please contact us at:
            </p>
            <div className="mt-4 text-slate-300">
              <p>Email: privacy@larkx.ai</p>
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
            <Link href="/terms" className="hover:text-white">
              Terms
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
