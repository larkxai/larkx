import * as React from "react";
import { Home, Users, Briefcase, GitBranch, BarChart } from "lucide-react";

import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar";

// Navigation data structure
const navigation = [
  {
    title: "Main",
    items: [
      {
        title: "Home",
        icon: Home,
        url: "/",
      },
      {
        title: "Reports & KPIs",
        icon: BarChart,
        url: "/reports",
      },
      {
        title: "Candidates",
        icon: Users,
        url: "/candidates",
      },
    ],
  },
  {
    title: "Jobs",
    items: [
      {
        title: "Roles",
        icon: Briefcase,
        url: "/jobs/roles",
      },
      {
        title: "Workflows",
        icon: GitBranch,
        url: "/jobs/workflows",
      },
      {
        title: "Openings",
        icon: Briefcase,
        url: "/jobs/openings",
      },
    ],
  },
];

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  // Get current path to determine active state
  const pathname =
    typeof window !== "undefined" ? window.location.pathname : "";

  return (
    <Sidebar variant="inset" {...props}>
      <SidebarContent>
        {navigation.map((group) => (
          <SidebarGroup key={group.title}>
            <SidebarGroupLabel>{group.title}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((item) => (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton
                      asChild
                      isActive={pathname === item.url}
                      tooltip={item.title}
                    >
                      <a href={item.url}>
                        <item.icon className="size-4" />
                        <span>{item.title}</span>
                      </a>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>
      <SidebarRail />
    </Sidebar>
  );
}
