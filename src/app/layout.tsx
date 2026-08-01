import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Meridian — OSINT Fusion Platform",
    template: "%s · Meridian",
  },
  description:
    "Open-source intelligence fusion. Graph-first investigation canvases for journalists, researchers, and analysts.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
