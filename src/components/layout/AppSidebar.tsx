"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Boxes,
  Cable,
  ChevronRight,
  Globe,
  Hexagon,
  LayoutDashboard,
  MapPin,
  MapPinned,
  Radio,
  ScanLine,
  ScrollText,
  Search,
  Server,
  ShoppingBag,
  SlidersHorizontal,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar";

interface NavLink {
  href: string;
  label: string;
  icon: LucideIcon;
  soon?: boolean;
}

interface NavSection {
  label: string;
  links: NavLink[];
}

const sections: NavSection[] = [
  {
    label: "Workspace",
    links: [
      { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
      { href: "/search", label: "Search", icon: Search },
      { href: "/canvas", label: "Canvases", icon: Boxes },
    ],
  },
  {
    label: "Lenses",
    links: [
      { href: "/timeline", label: "Timeline", icon: ScrollText },
      { href: "/geo", label: "Geo View", icon: MapPinned },
      { href: "/globe", label: "World View", icon: Globe },
      { href: "/geolocate", label: "Geolocate", icon: MapPin },
      { href: "/imint", label: "Image Intel", icon: ScanLine },
    ],
  },
  {
    label: "Platform",
    links: [
      { href: "/marketplace", label: "Marketplace", icon: ShoppingBag },
      { href: "/connectors", label: "Connectors", icon: Cable },
      { href: "/feed", label: "Live Feed", icon: Radio },
      { href: "/health", label: "System", icon: Server },
      { href: "/settings", label: "Settings", icon: SlidersHorizontal },
    ],
  },
];

export default function AppSidebar() {
  const pathname = usePathname();

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="border-b border-sidebar-border">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild className="data-[active=true]:bg-transparent">
              <Link href="/dashboard">
                <div className="flex aspect-square size-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
                  <Hexagon className="size-5" strokeWidth={1.5} />
                </div>
                <div className="grid flex-1 text-left leading-tight">
                  <span className="font-mono text-sm font-semibold tracking-[0.22em]">SERAPH</span>
                  <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                    Intelligence Fusion
                  </span>
                </div>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        {sections.map((section, index) => (
          <SidebarGroup
            key={section.label}
            className={cn(
              index > 0 && "border-t border-sidebar-border",
              index > 0 && "pt-4",
            )}
          >
            <SidebarGroupLabel className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground!">
              {section.label}
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {section.links.map((link) => {
                  const Icon = link.icon;
                  const active =
                    pathname === link.href || pathname.startsWith(`${link.href}/`);
                  return (
                    <SidebarMenuItem key={link.href}>
                      <span
                        className={cn(
                          "absolute left-0 top-1/2 z-10 h-4 w-0.5 -translate-y-1/2 rounded-full bg-primary transition-opacity duration-150",
                          active ? "opacity-100" : "opacity-0",
                          "group-data-[collapsible=icon]:hidden",
                        )}
                        aria-hidden
                      />
                      <SidebarMenuButton asChild isActive={active} tooltip={link.label}>
                        <Link href={link.href}>
                          <Icon
                            className={cn(
                              "text-muted-foreground transition-colors",
                              active && "text-primary!",
                            )}
                            strokeWidth={1.75}
                          />
                          <span>{link.label}</span>
                          {link.soon ? (
                            <span className="ml-auto rounded border border-border px-1 py-0.5 font-mono text-[9px] text-muted-foreground">
                              soon
                            </span>
                          ) : (
                            <ChevronRight
                              className={cn(
                                "ml-auto size-3.5 text-muted-foreground/50 transition-transform",
                                active ? "translate-x-0 text-primary!" : "-translate-x-1",
                              )}
                              strokeWidth={1.75}
                            />
                          )}
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="sm" asChild>
              <Link href="/health">
                <span className="relative flex size-2 shrink-0">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex size-2 rounded-full bg-emerald-500" />
                </span>
                <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                  All systems nominal
                </span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  );
}