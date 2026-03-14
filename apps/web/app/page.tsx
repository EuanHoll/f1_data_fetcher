import { AuthPanel } from "@/components/auth-panel";
import { ComparisonLab } from "@/components/comparison-lab";
import { CoveragePanel } from "@/components/coverage-panel";
import { SavedViewsPanel } from "@/components/saved-views-panel";
import { SessionExplorer } from "@/components/session-explorer";
import Link from "next/link";

const checks = [
  {
    label: "Convex Backend URL",
    value: process.env.NEXT_PUBLIC_CONVEX_URL ?? "missing",
    good: Boolean(process.env.NEXT_PUBLIC_CONVEX_URL)
  },
  {
    label: "Self-hosted URL",
    value: process.env.CONVEX_SELF_HOSTED_URL ?? "missing",
    good: Boolean(process.env.CONVEX_SELF_HOSTED_URL)
  },
  {
    label: "Self-hosted Admin Key",
    value: process.env.CONVEX_SELF_HOSTED_ADMIN_KEY ? "configured" : "missing",
    good: Boolean(process.env.CONVEX_SELF_HOSTED_ADMIN_KEY)
  }
];

export default function HomePage() {
  return (
    <>
      <header className="topbar">
        <div className="topbar-inner">
          <div className="brand">
            <div className="brand-mark">PL</div>
            <div>
              <p style={{ margin: 0, fontWeight: 700, lineHeight: 1.2 }}>F1 Pace Lab</p>
              <p style={{ margin: 0, color: "#6d7f95", fontSize: "0.83rem" }}>Session Explorer</p>
            </div>
          </div>
          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", justifyContent: "flex-end" }}>
            <Link className="btn" href="/ingestion">
              Ingestion Control
            </Link>
            {checks.map((check) => (
              <span key={check.label} className="pill" style={{ background: check.good ? "#effaf3" : "#fff3f3" }}>
                <span style={{ color: check.good ? "#157647" : "#b03a3a", fontWeight: 700 }}>{check.good ? "OK" : "Missing"}</span>
                <span>{check.label}</span>
              </span>
            ))}
          </div>
        </div>
      </header>

      <main className="container">
        <section className="panel" style={{ marginBottom: "1rem" }}>
          <p style={{ margin: 0, fontSize: "0.8rem", letterSpacing: "0.08em", textTransform: "uppercase", color: "#6b7e81" }}>
            Open analytics for everyone, account features when you want them
          </p>
          <h1 style={{ margin: "0.4rem 0 0.5rem", fontSize: "2rem" }}>F1 Pace Lab</h1>
          <p style={{ margin: 0, color: "#314144" }}>
            Explore session data in the browser without logging in. Sign in only when you want personal saved views and shareable analysis presets.
          </p>
        </section>

        <SessionExplorer />
        <ComparisonLab />
        <CoveragePanel />
        <AuthPanel />
        <SavedViewsPanel />
      </main>
    </>
  );
}
