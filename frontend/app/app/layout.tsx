"use client";

import { AppSidebar } from "@/components/app-sidebar";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
} from "@/components/ui/breadcrumb";
import { Separator } from "@/components/ui/separator";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
          <header className="flex h-16 shrink-0 items-center gap-2 border-b border-white/10 px-4 bg-slate-900/40 backdrop-blur">
            <SidebarTrigger className="-ml-1 text-slate-100 hover:bg-white/5" />
            <Separator orientation="vertical" className="mr-2 h-4 bg-white/10" />
            <Breadcrumb>
              <BreadcrumbList className="text-slate-300">
                <BreadcrumbItem>
                  <BreadcrumbPage className="text-slate-100 font-medium">Dashboard</BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
            <div className="ml-auto flex gap-2"></div>
          </header>
          <main className="flex-1">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  );
}
