import AppSidebar from "@/components/layout/AppSidebar";
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
        <header className="flex h-12 shrink-0 items-center gap-2 border-b px-4">
          <SidebarTrigger className="[&_svg]:size-4" />
          <Separator orientation="vertical" className="mr-1 data-[orientation=vertical]:h-4" />
          <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
            seraph · intelligence fusion platform
          </div>
        </header>
        <main className="flex-1 overflow-auto">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  );
}