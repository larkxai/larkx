import { MarketingNavbar } from "@/components/marketing-navbar";
import { MarketingFooter } from "@/components/marketing-footer";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Larkx - AI-Powered App Store Publishing Platform",
  description: "Your AI agent that builds, validates, and publishes mobile apps to iOS and Android — no developers required. Built for non-technical founders.",
  keywords: ["app store", "google play", "mobile app publishing", "app submission", "AI publishing", "app store optimization"],
  authors: [{ name: "Larkx" }],
  openGraph: {
    title: "Larkx - AI-Powered App Store Publishing Platform",
    description: "Your AI agent that builds, validates, and publishes mobile apps to iOS and Android — no developers required.",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Larkx - AI-Powered App Store Publishing Platform",
    description: "Your AI agent that builds, validates, and publishes mobile apps to iOS and Android — no developers required.",
  },
};

export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-b from-slate-950 via-slate-930 to-slate-900 text-slate-100">
      <MarketingNavbar />
      <main className="flex-1">{children}</main>
      <MarketingFooter />
    </div>
  );
}
