import AppSidebar from "@/components/layout/AppSidebar";

export default function AppLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="shell">
      <AppSidebar />
      <main className="main">{children}</main>
    </div>
  );
}
