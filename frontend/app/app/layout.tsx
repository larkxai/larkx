"use client";

import { AppSidebar } from "@/components/app-sidebar";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbLink,
} from "@/components/ui/breadcrumb";
import { Separator } from "@/components/ui/separator";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { usePathname } from "next/navigation";
import Link from "next/link";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isAddAppFlow = pathname?.includes('/apps/new');
  
  const getBreadcrumbs = () => {
    if (!pathname) return [{ label: 'Dashboard', href: '/dashboard' }];
    
    // Split the pathname into segments
    const segments = pathname.split('/').filter(Boolean);
    
    // Build breadcrumbs dynamically
    const breadcrumbs = [];
    let currentPath = '';
    
    // Always start with Dashboard for app routes
    if (segments[0] === 'app') {
      breadcrumbs.push({ label: 'Dashboard', href: '/dashboard' });
      currentPath = '/app';
    }
    
    // Process each segment
    segments.forEach((segment, index) => {
      currentPath += `/${segment}`;
      
      // Skip the 'app' segment as we already handled it
      if (segment === 'app') return;
      
      // Generate human-readable labels
      let label = segment;
      
      // Handle special cases
      switch (segment) {
        case 'dashboard':
          label = 'Dashboard';
          break;
        case 'apps':
          label = 'Apps';
          break;
        case 'new':
          label = 'New App';
          break;
        case 'submissions':
          label = 'Submissions';
          break;
        case 'history':
          label = 'History';
          break;
        case 'content':
          label = 'AI Content';
          break;
        case 'metadata':
          label = 'Metadata';
          break;
        case 'screenshots':
          label = 'Screenshots';
          break;
        case 'privacy':
          label = 'Privacy Policy';
          break;
        case 'localization':
          label = 'Localization';
          break;
        default:
          // For dynamic segments (like app IDs), try to make them more readable
          if (segment.match(/^[a-f0-9-]+$/i)) {
            // Looks like an ID, show as "App Details"
            label = 'App Details';
          } else {
            // Capitalize first letter and replace hyphens with spaces
            label = segment.charAt(0).toUpperCase() + segment.slice(1).replace(/-/g, ' ');
          }
      }
      
      breadcrumbs.push({ label, href: currentPath });
    });
    
    return breadcrumbs;
  };

  const breadcrumbs = getBreadcrumbs();

  return (
    <SidebarProvider defaultOpen={!isAddAppFlow}>
      {!isAddAppFlow && <AppSidebar />}
      <SidebarInset className="bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
          <header className="flex h-16 shrink-0 items-center gap-2 border-b border-white/10 px-6 bg-slate-800/60 backdrop-blur">
            {!isAddAppFlow && <SidebarTrigger className="-ml-1 text-slate-100 hover:bg-white/5" />}
            {!isAddAppFlow && <Separator orientation="vertical" className="mr-2 h-4 bg-white/10" />}
            <Breadcrumb>
              <BreadcrumbList className="text-slate-300">
                {breadcrumbs.map((crumb, index) => (
                  <BreadcrumbItem key={index}>
                    {index === breadcrumbs.length - 1 ? (
                      <BreadcrumbPage className="text-slate-100 font-medium">{crumb.label}</BreadcrumbPage>
                    ) : (
                      <BreadcrumbLink asChild>
                        <Link href={crumb.href} className="text-slate-300 hover:text-slate-100">
                          {crumb.label}
                        </Link>
                      </BreadcrumbLink>
                    )}
                  </BreadcrumbItem>
                ))}
              </BreadcrumbList>
            </Breadcrumb>
            <div className="ml-auto flex gap-2"></div>
          </header>
          <main className="flex-1 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  );
}
