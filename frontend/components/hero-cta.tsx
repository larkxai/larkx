"use client"

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Rocket } from "lucide-react";

export function HeroCTA() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isClient, setIsClient] = useState(false);
  
  useEffect(() => {
    setIsClient(true);
    const getSessionCookie = () => {
      const cookie = document.cookie.split('; ').find(row => row.startsWith('session='));
      return cookie ? cookie.split('=')[1] : null;
    };

    setIsAuthenticated(!!getSessionCookie());
  }, []);
  
  const ctaText = isClient ? (isAuthenticated ? "Go to console" : "Get started") : "Get started";
  
  return (
    <Link href="/dashboard">
      <Button className="rounded-2xl px-6 py-6 text-base bg-indigo-500 hover:bg-indigo-600">
        <Rocket className="h-5 w-5 mr-2" /> {ctaText}
      </Button>
    </Link>
  );
}


