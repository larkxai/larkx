import * as React from "react";
import {
  Home,
  Users,
  FileText,
  GitBranch,
  BarChart,
  Briefcase,
} from "lucide-react";

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
        title: "Requisitions",
        icon: FileText,
        url: "/jobs/requisitions",
      },
      {
        title: "Workflows",
        icon: GitBranch,
        url: "/jobs/workflows",
      },
      {
        title: "Listings",
        icon: Briefcase,
        url: "/jobs/listings",
      },
    ],
  },
];

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const pathname =
    typeof window !== "undefined" ? window.location.pathname : "";

  return (
    <Sidebar variant="inset" {...props}>
      <SidebarHeader>Hiredot</SidebarHeader>
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
