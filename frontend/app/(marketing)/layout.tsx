"use client";

export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-b from-slate-950 via-slate-930 to-slate-900 text-slate-100">
      <main className="flex-1">{children}</main>
    </div>
  );
}
