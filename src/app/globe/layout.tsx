import "@/wwv/globals.css";
import "@/wwv/styles/hud-animations.css";
export default function GlobeLayout({ children }: { children: React.ReactNode }) {
  return <div className="wwv-root" style={{ position: "relative", width: "100%", height: "100dvh", background: "#000", overflow: "hidden" }}>{children}</div>;
}