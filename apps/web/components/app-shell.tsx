import { ReactNode } from "react";
import { auth } from "@/auth";
import { isViewerAdmin } from "@/lib/authz";
import { AccountNav } from "@/components/account-nav";
import { ModuleNav } from "@/components/module-nav";
import { SystemHeader } from "@/components/system-header";

type AppShellProps = {
  activeModule: "home" | "explore" | "compare" | "saved" | "admin";
  children: ReactNode;
};

export async function AppShell({ activeModule, children }: AppShellProps) {
  const session = await auth();
  const isAdmin = isViewerAdmin({
    id: session?.user?.id,
    email: session?.user?.email
  });
  const isAdminView = activeModule === "admin";

  return (
    <div className={`app-shell ${isAdminView ? "admin-view" : ""}`}>
      <SystemHeader isAdminView={isAdminView} />
      <nav className={`navbar ${isAdminView ? "admin-navbar" : ""}`}>
        <div className="logo">
          <span className={`logo-text ${isAdminView ? "text-danger" : ""}`}>PACE LAB</span>
          <span className={`logo-beta ${isAdminView ? "bg-danger" : ""}`}>{isAdminView ? "SYS.ADMIN" : "BETA"}</span>
        </div>
        <ModuleNav activeModule={activeModule} isAdmin={isAdmin} />
        <AccountNav isAdminView={isAdminView} />
      </nav>
      <main className="app-main">{children}</main>
    </div>
  );
}
