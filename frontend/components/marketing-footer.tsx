import Link from "next/link";

export function MarketingFooter() {
  return (
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
          <Link href="/terms" className="hover:text-white">
            Terms
          </Link>
          <Link href="/refund" className="hover:text-white">
            Refund Policy
          </Link>
          <Link href="#" className="hover:text-white">
            Contact
          </Link>
        </div>
      </div>
    </footer>
  );
}


