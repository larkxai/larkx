"use client"

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Sparkles } from "lucide-react";
import { useEffect, useState } from "react";

export function MarketingNavbar() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isClient, setIsClient] = useState(false);
  
  // Check for session cookie to determine if user is authenticated
  useEffect(() => {
    setIsClient(true);
    const getSessionCookie = () => {
      const cookie = document.cookie.split('; ').find(row => row.startsWith('session='));
      return cookie ? cookie.split('=')[1] : null;
    };
    
    setIsAuthenticated(!!getSessionCookie());
  }, []);
  
  return (
    <nav className="sticky top-0 z-40 backdrop-blur supports-[backdrop-filter]:bg-slate-950/60 border-b border-white/10">
      <div className="container mx-auto px-4 py-4 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-xl bg-gradient-to-br from-indigo-500 to-blue-500 grid place-items-center shadow-md">
            <Sparkles className="h-4 w-4" />
          </div>
          <span className="font-semibold tracking-tight">Larkx</span>
        </Link>

        <div className="hidden md:flex items-center gap-6 text-sm text-slate-300">
          <Link href="#features" className="hover:text-white">
            Features
          </Link>
          <Link href="#how" className="hover:text-white">
            How it works
          </Link>
          <Link href="#pricing" className="hover:text-white">
            Pricing
          </Link>
          <Link href="#faq" className="hover:text-white">
            FAQ
          </Link>
        </div>

        <div className="flex items-center gap-3">
          <Link href="/dashboard">
            <Button
              size="sm"
              className="bg-indigo-500 hover:bg-indigo-600 rounded-xl"
            >
              {isClient ? (isAuthenticated ? "Go to console" : "Get started") : "Get started"}
            </Button>
          </Link>
        </div>
      </div>
    </nav>
  );
}


