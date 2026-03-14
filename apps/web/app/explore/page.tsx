import { AppShell } from "@/components/app-shell";
import { SessionExplorer } from "@/components/session-explorer";

export default async function ExplorePage() {
  return (
    <AppShell activeModule="explore">
      <div className="container page-stack">
        <SessionExplorer />
      </div>
    </AppShell>
  );
}
