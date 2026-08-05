"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Boxes, MapPin, Radio, Search, User } from "lucide-react";
import type { LucideIcon } from "lucide-react";

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
  { href: "/settings", label: "Profile", icon: User },
];

/** Mobile-only bottom tab bar (desktop uses the sidebar). */
export default function MobileTabBar() {
  const pathname = usePathname();

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 backdrop-blur lg:hidden"
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
              className="flex flex-col items-center gap-1 py-2.5 text-[10px] uppercase tracking-widest text-muted-foreground transition-colors aria-[current=true]:text-primary"
              aria-current={active ? "page" : undefined}
            >
              <Icon className="size-5" strokeWidth={1.75} />
              {tab.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
