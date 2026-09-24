import { AppSidebar } from "@/components/app-sidebar";
import { SiteHeader } from "@/components/site-header";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";
import { LiveProvider } from "@/lib/hooks/use-live";

export default function AppLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <LiveProvider>
      <TooltipProvider delay={200}>
        <SidebarProvider
          defaultOpen
          style={{ "--sidebar-width": "15rem", "--sidebar-width-icon": "3.25rem" } as React.CSSProperties}
        >
          <AppSidebar />
          <SidebarInset className="min-h-svh bg-background">
            <SiteHeader />
            <div className="flex-1 px-4 py-5 lg:px-6">{children}</div>
          </SidebarInset>
        </SidebarProvider>
      </TooltipProvider>
    </LiveProvider>
  );
}
