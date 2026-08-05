import AppSidebar from "@/components/layout/AppSidebar";
import MobileTabBar from "@/components/layout/MobileTabBar";
import TopSearch from "@/components/layout/TopSearch";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";

export default function AppLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset className="gap-0">
        <header className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-4">
          <SidebarTrigger className="[&_svg]:size-4" />
          <Separator orientation="vertical" className="mr-1 data-[orientation=vertical]:h-4" />
          <div className="hidden font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground md:block">
            seraph · intelligence fusion platform
          </div>
          <div className="ml-auto flex items-center justify-end gap-2">
            <TopSearch />
          </div>
        </header>
        <main className="flex-1 overflow-auto pb-14 lg:pb-0">{children}</main>
        <MobileTabBar />
      </SidebarInset>
    </SidebarProvider>
  );
}