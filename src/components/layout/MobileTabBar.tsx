"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Boxes, MapPin, Radio, ScanLine, Search, User } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface Tab {
  href: string;
  label: string;
  icon: LucideIcon;
}

const tabs: Tab[] = [
  { href: "/search", label: "Search", icon: Search },
  { href: "/geolocate", label: "Geolocate", icon: MapPin },
  { href: "/feed", label: "Feed", icon: Radio },
  { href: "/canvas", label: "Canvases", icon: Boxes },
  { href: "/imint", label: "Image Intel", icon: ScanLine },
  { href: "/settings", label: "Profile", icon: User },
];

/** Mobile-only bottom tab bar (desktop uses the sidebar). */
export default function MobileTabBar() {
  const pathname = usePathname();

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 backdrop-blur lg:hidden"
      aria-label="Primary"
    >
      <div className="grid grid-cols-5">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const active = pathname === tab.href || pathname.startsWith(`${tab.href}/`);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={cn(
                "relative flex flex-col items-center gap-1 py-2 font-mono text-[10px] uppercase tracking-[0.18em] transition-colors",
                active ? "text-primary" : "text-muted-foreground hover:text-foreground",
              )}
              aria-current={active ? "page" : undefined}
            >
              {active ? (
                <span className="absolute inset-x-5 top-0 h-px bg-primary" aria-hidden />
              ) : null}
              <span
                className={cn(
                  "flex items-center justify-center rounded-full px-3 py-1 transition-colors",
                  active && "bg-primary/10",
                )}
              >
                <Icon className="size-5" strokeWidth={1.75} />
              </span>
              {tab.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
