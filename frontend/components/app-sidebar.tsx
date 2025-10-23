"use client";

import * as React from "react";
import {
  Home,
  Users,
  FileText,
  GitBranch,
  ChevronsUpDown,
  Send,
  CreditCard,
  Bell,
  LogOut,
  Plus,
  Building2,
  Store,
  Sparkles,
  ShieldCheck,
  Globe,
  LifeBuoy,
  Image as ImageIcon,
  Key,
  Rocket,
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
  SidebarFooter,
} from "@/components/ui/sidebar";

import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuGroup,
  DropdownMenuSeparator,
  DropdownMenuLabel,
  DropdownMenuShortcut,
} from "./ui/dropdown-menu";

import { Avatar, AvatarImage } from "@/components/ui/avatar";
import { api } from "@/lib/api";
import { useAuthStore } from "@/lib/store/auth";
import { useRouter } from "next/navigation";
import { Organization } from "@/@types/organization";

const navigation = [
  {
    title: "Main",
    items: [
      { title: "Home", icon: Home, url: "/dashboard" },
    ],
  },
  {
    title: "Apps",
    items: [
      { title: "All Apps", icon: Store, url: "/apps" },
      { title: "Submissions", icon: Rocket, url: "/submissions" },
    ],
  },
  {
    title: "Activity",
    items: [
      { title: "History", icon: GitBranch, url: "/history" },
    ],
  },
  {
    title: "AI Content",
    items: [
      { title: "Metadata", icon: FileText, url: "/content/metadata" },
      { title: "Screenshots", icon: ImageIcon, url: "/content/screenshots" },
      { title: "Privacy Policy", icon: ShieldCheck, url: "/content/privacy" },
      { title: "Localization", icon: Globe, url: "/content/localization" },
    ],
  },
];

const secondaryNav = [
  {
    title: "Support",
    icon: LifeBuoy,
    url: "#",
  },
  {
    title: "Feedback",
    icon: Send,
    url: "#",
  },
];

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const pathname = typeof window !== "undefined" ? window.location.pathname : "";
  const [organization, setOrganization] = React.useState<Organization | null>(null);
  const [loading, setLoading] = React.useState(true);
  const router = useRouter();
  const { user, logout } = useAuthStore();

  console.log(user);

  React.useEffect(() => {
    const fetchOrganization = async () => {
      try {
        const data = await api.organizations.getCurrent();
        setOrganization(data);
      } catch (error) {
        console.error('Error fetching organization:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchOrganization();
  }, []);

  const [activeTeam, setActiveTeam] = React.useState(organization?.teams[0]);

  React.useEffect(() => {
    if (organization?.teams[0]) {
      setActiveTeam(organization.teams[0]);
    }
  }, [organization]);

  const handleLogout = async () => {
    try {
      await logout();
      router.replace('/login');
    } catch (error) {
      console.error('Logout failed:', error);
    }
  };

  if (loading || !organization) {
    return <div>Loading...</div>;
  }

  return (
    <Sidebar variant="sidebar" className="bg-slate-950 border-r border-slate-700/50 min-h-screen" {...props}>
      <SidebarHeader className="bg-slate-950">
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton
                  size="lg"
                >
                  <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-blue-500 text-white">
                    <Sparkles className="h-4 w-4" />
                  </div>
                  <div className="grid flex-1 text-left text-sm leading-tight">
                    <span className="truncate font-semibold">
                      {activeTeam?.name || "Larkx"}
                    </span>
                  </div>
                  <ChevronsUpDown className="ml-auto" />
                </SidebarMenuButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                className="w-[--radix-dropdown-menu-trigger-width] min-w-56 rounded-lg bg-slate-900/95 backdrop-blur border border-white/10"
                align="start"
                side="bottom"
                sideOffset={4}
              >
                <DropdownMenuLabel className="text-xs text-slate-400">
                  Teams
                </DropdownMenuLabel>
                {organization.teams.map((team, index) => (
                  <DropdownMenuItem
                    key={team.name}
                    onClick={() => setActiveTeam(team)}
                    className="gap-2 p-2 text-slate-100 hover:bg-white/5 focus:bg-white/5"
                  >
                    <div className="flex size-6 items-center justify-center rounded-sm border">
                      {team.logoUrl ? (
                        <img src={team.logoUrl} className="size-4 shrink-0" alt={`${team.name} logo`} />
                      ) : (
                        <Building2 className="size-4 shrink-0" />
                      )}
                    </div>
                    {team.name}
                    <DropdownMenuShortcut>⌘{index + 1}</DropdownMenuShortcut>
                  </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator className="bg-white/10" />
                <DropdownMenuItem className="gap-2 p-2 text-slate-100 hover:bg-white/5 focus:bg-white/5">
                  <div className="flex size-6 items-center justify-center rounded-md border bg-background">
                    <Plus className="size-4" />
                  </div>
                  <div className="font-medium text-slate-400">
                    Add team
                  </div>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent className="bg-slate-950">
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
        <SidebarGroup className="mt-auto">
          <SidebarGroupContent>
            <SidebarMenu>
              {secondaryNav.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton 
                    asChild 
                    size="sm"
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
      </SidebarContent>
      <SidebarFooter className="bg-slate-950">
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton
                  size="lg"
                >
                  <Avatar className="h-8 w-8 rounded-lg">
                    <AvatarImage
                      src={"https://i.ibb.co/s99n7GzY/Screenshot-2025-10-20-at-5-08-04-PM.png"}
                      alt={user?.firstName}
                    /> 
                    {/* <AvatarFallback className="rounded-lg bg-indigo-500 text-white">
                      {user?.firstName?.charAt(0)}
                      {user?.lastName?.charAt(0)}
                    </AvatarFallback> */}
                  </Avatar>
                  <div className="grid flex-1 text-left text-sm leading-tight">
                    <span className="truncate font-semibold">
                      {/* {user?.firstName} {user?.lastName} */}
                      Alex B
                    </span>
                    <span className="truncate text-xs">{user?.email}</span>
                  </div>
                  <ChevronsUpDown className="ml-auto size-4" />
                </SidebarMenuButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                className="w-[--radix-dropdown-menu-trigger-width] min-w-56 bg-slate-900/95 backdrop-blur border border-white/10"
                align="end"
                sideOffset={4}
              >
                <DropdownMenuGroup>
                  <DropdownMenuItem>
                    <Users className="mr-2" />
                    Teams & Roles
                  </DropdownMenuItem>
                  <DropdownMenuItem>
                    <FileText className="mr-2" />
                    Audit Log
                  </DropdownMenuItem>
                </DropdownMenuGroup>
                <DropdownMenuSeparator className="bg-white/10" />
                <DropdownMenuGroup>
                  <DropdownMenuItem>
                    <CreditCard className="mr-2" />
                    Billing & Plan
                  </DropdownMenuItem>
                  <DropdownMenuItem>
                    <Key className="mr-2" />
                    API Keys
                  </DropdownMenuItem>
                  <DropdownMenuItem>
                    <Bell className="mr-2" />
                    Notifications
                  </DropdownMenuItem>
                </DropdownMenuGroup>
                <DropdownMenuSeparator className="bg-white/10" />
                <DropdownMenuItem onClick={handleLogout} className="text-slate-100 hover:bg-white/5 focus:bg-white/5">
                  <LogOut className="mr-2" />
                  Log out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
