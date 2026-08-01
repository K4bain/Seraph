"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

interface NavLink {
  href: string;
  label: string;
  soon?: boolean;
}

const sections: { label: string; links: NavLink[] }[] = [
  {
    label: "Workspace",
    links: [
      { href: "/dashboard", label: "Dashboard" },
      { href: "/canvas", label: "Canvases" },
    ],
  },
  {
    label: "Lenses",
    links: [
      { href: "/timeline", label: "Timeline" },
      { href: "/geo", label: "Geo View" },
    ],
  },
  {
    label: "Platform",
    links: [
      { href: "/connectors", label: "Connectors" },
      { href: "/health", label: "System", soon: true },
    ],
  },
] as const satisfies { label: string; links: NavLink[] }[];

export default function AppSidebar() {
  const pathname = usePathname();

  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-mark">M</div>
        <div className="brand-name">Meridian</div>
      </div>

      {sections.map((section) => (
        <nav key={section.label} aria-label={section.label}>
          <div className="nav-section-label">{section.label}</div>
          {section.links.map((link) => {
            const active = pathname === link.href || pathname.startsWith(`${link.href}/`);
            return (
              <Link key={link.href} href={link.href} className={`nav-link${active ? " active" : ""}`}>
                <span>{link.label}</span>
                {link.soon ? <span className="nav-tag">soon</span> : null}
              </Link>
            );
          })}
        </nav>
      ))}
    </aside>
  );
}
