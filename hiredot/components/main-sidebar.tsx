"use client";

import {
  Home,
  Users,
  Briefcase,
  GitBranch,
  BarChart,
  ChevronLeft,
  User2,
  Settings,
  LogOut,
  FileText as DocumentTextIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { useState } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";

const menuItems = [
  {
    title: "Home",
    icon: Home,
    href: "/",
  },
  {
    title: "Reports & KPIs",
    icon: BarChart,
    href: "/reports",
  },
  {
    title: "Jobs",
    icon: Briefcase,
    href: "/jobs",
  },
  {
    title: "Publishing",
    icon: DocumentTextIcon,
    href: "/publishing",
  },
  {
    title: "Candidates",
    icon: Users,
    href: "/candidates",
  },
  {
    title: "Workflows",
    icon: GitBranch,
    href: "/workflows",
  },
];

export function MainSidebar() {
  const pathname = usePathname();
  const [isCollapsed, setIsCollapsed] = useState(false);

  return (
    <div
      className={cn(
        "relative min-h-screen border-r bg-white transition-all duration-300",
        isCollapsed ? "w-16" : "w-64"
      )}
    >
      <div className="flex h-16 items-center justify-between border-b px-4">
        <Link
          href="/"
          className={cn(
            "flex items-center gap-2 font-semibold",
            isCollapsed && "justify-center"
          )}
        >
          {!isCollapsed && <span className="text-xl">Hiredot</span>}
          {isCollapsed && <span className="text-xl">H.</span>}
        </Link>
      </div>

      <nav className="flex flex-col gap-1 p-4">
        {menuItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "flex items-center gap-2 rounded-lg px-3 py-2 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900",
              pathname === item.href && "bg-gray-100 text-gray-900",
              isCollapsed && "justify-center px-2"
            )}
            title={isCollapsed ? item.title : undefined}
          >
            <item.icon className="h-4 w-4 shrink-0" />
            {!isCollapsed && <span>{item.title}</span>}
          </Link>
        ))}
      </nav>

      {/* Collapse Button */}
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="absolute -right-4 top-20 hidden h-8 w-8 rounded-full border shadow-md md:flex"
        onClick={() => setIsCollapsed(!isCollapsed)}
      >
        <ChevronLeft
          className={cn(
            "h-4 w-4 transition-transform",
            isCollapsed && "rotate-180"
          )}
        />
      </Button>

      {/* Profile Section */}
      <div className="absolute bottom-0 left-0 right-0 border-t p-4">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              className={cn(
                "w-full justify-start gap-2",
                isCollapsed && "justify-center px-2"
              )}
            >
              <User2 className="h-4 w-4" />
              {!isCollapsed && <span>Profile</span>}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-56"
            align={isCollapsed ? "center" : "start"}
            side="top"
          >
            <DropdownMenuItem>
              <User2 className="mr-2 h-4 w-4" />
              <span>My Profile</span>
            </DropdownMenuItem>
            <DropdownMenuItem>
              <Settings className="mr-2 h-4 w-4" />
              <span>Settings</span>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="text-red-600">
              <LogOut className="mr-2 h-4 w-4" />
              <span>Log out</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
