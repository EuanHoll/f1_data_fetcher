import { AppShell } from "@/components/app-shell";
import { ComparisonLab } from "@/components/comparison-lab";

export default async function ComparePage() {
  return (
    <AppShell activeModule="compare">
      <div className="container page-stack">
        <ComparisonLab />
      </div>
    </AppShell>
  );
}
