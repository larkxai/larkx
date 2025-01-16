"use client"

import Link from "next/link"
import { Button } from "@/components/ui/button"

export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b">
        <div className="container mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-12">
            <Link href="/" className="font-bold text-xl">
              Larkx
            </Link>
            
            <nav className="hidden md:flex items-center gap-8">
              <Link href="/use-cases" className="text-sm font-medium hover:text-primary transition-colors">
                Use Cases
              </Link>
              <Link href="/product-updates" className="text-sm font-medium hover:text-primary transition-colors">
                Product Updates
              </Link>
              <Link href="/about" className="text-sm font-medium hover:text-primary transition-colors">
                About
              </Link>
              <Link href="/contact" className="text-sm font-medium hover:text-primary transition-colors">
                Contact Us
              </Link>
            </nav>
          </div>

          <div className="flex items-center gap-4">
            <Link href="/app/dashboard">
              <Button variant="ghost">Login</Button>
            </Link>
            <Link href="/app/dashboard">
              <Button>Get Started</Button>
            </Link>
          </div>
        </div>
      </header>

      <main className="flex-1">
        {children}
      </main>

      <footer className="border-t py-12 bg-secondary/10">
        <div className="container mx-auto px-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            <div>
              <h3 className="font-semibold mb-4">Product</h3>
              <div className="space-y-2">
                <Link href="/use-cases" className="block text-sm text-muted-foreground hover:text-foreground">Use Cases</Link>
                <Link href="/product-updates" className="block text-sm text-muted-foreground hover:text-foreground">Product Updates</Link>
                <Link href="/pricing" className="block text-sm text-muted-foreground hover:text-foreground">Pricing</Link>
              </div>
            </div>
            <div>
              <h3 className="font-semibold mb-4">Company</h3>
              <div className="space-y-2">
                <Link href="/about" className="block text-sm text-muted-foreground hover:text-foreground">About</Link>
                <Link href="/contact" className="block text-sm text-muted-foreground hover:text-foreground">Contact Us</Link>
                <Link href="/careers" className="block text-sm text-muted-foreground hover:text-foreground">Careers</Link>
              </div>
            </div>
            <div>
              <h3 className="font-semibold mb-4">Resources</h3>
              <div className="space-y-2">
                <Link href="/blog" className="block text-sm text-muted-foreground hover:text-foreground">Blog</Link>
                <Link href="/docs" className="block text-sm text-muted-foreground hover:text-foreground">Documentation</Link>
                <Link href="/help" className="block text-sm text-muted-foreground hover:text-foreground">Help Center</Link>
              </div>
            </div>
            <div>
              <h3 className="font-semibold mb-4">Legal</h3>
              <div className="space-y-2">
                <Link href="/privacy" className="block text-sm text-muted-foreground hover:text-foreground">Privacy Policy</Link>
                <Link href="/terms" className="block text-sm text-muted-foreground hover:text-foreground">Terms of Service</Link>
                <Link href="/security" className="block text-sm text-muted-foreground hover:text-foreground">Security</Link>
              </div>
            </div>
          </div>
          <div className="mt-12 text-center text-sm text-muted-foreground">
            © {new Date().getFullYear()} Larkx. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  )
} 