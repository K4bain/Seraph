"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Boxes,
  Cable,
  ChevronRight,
  Hexagon,
  LayoutDashboard,
  MapPin,
  MapPinned,
  Radio,
  Satellite,
  ScrollText,
  Search,
  Server,
  ShoppingBag,
  SlidersHorizontal,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
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
      { href: "/globe", label: "Globe 3D", icon: Satellite },
      { href: "/geolocate", label: "Geolocate", icon: MapPin },
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
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild className="data-[active=true]:bg-transparent">
              <Link href="/dashboard">
                <div className="bg-primary text-primary-foreground flex aspect-square size-8 items-center justify-center rounded-md">
                  <Hexagon className="size-5" strokeWidth={1.5} />
                </div>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="font-semibold tracking-[0.22em]">SERAPH</span>
                  <span className="text-xs text-muted-foreground tracking-[0.14em]">
                    INTELLIGENCE FUSION
                  </span>
                </div>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        {sections.map((section) => (
          <SidebarGroup key={section.label}>
            <SidebarGroupLabel>{section.label}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {section.links.map((link) => {
                  const Icon = link.icon;
                  const active =
                    pathname === link.href || pathname.startsWith(`${link.href}/`);
                  return (
                    <SidebarMenuItem key={link.href}>
                      <SidebarMenuButton asChild isActive={active} tooltip={link.label}>
                        <Link href={link.href}>
                          <Icon className={active ? "text-primary" : undefined} strokeWidth={1.75} />
                          <span>{link.label}</span>
                          {link.soon ? (
                            <span className="ml-auto rounded border px-1 py-0.5 font-mono text-[9px] text-muted-foreground">
                              soon
                            </span>
                          ) : (
                            <ChevronRight
                              className={`ml-auto size-3.5 text-muted-foreground/50 transition-transform ${
                                active ? "translate-x-0 text-primary" : "-translate-x-1"
                              }`}
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

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="sm" asChild>
              <Link href="/health">
                <Server className="size-4" strokeWidth={1.75} />
                <span className="flex items-center gap-2">
                  <span className="relative flex size-2">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                    <span className="relative inline-flex size-2 rounded-full bg-emerald-500" />
                  </span>
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