import { auth } from "@/auth";
import { AuthPanel } from "@/components/auth-panel";
import { ComparisonLab } from "@/components/comparison-lab";
import { CoveragePanel } from "@/components/coverage-panel";
import { SavedViewsPanel } from "@/components/saved-views-panel";
import { SessionExplorer } from "@/components/session-explorer";
import { isViewerAdmin } from "@/lib/authz";
import Link from "next/link";

const productStats = [
  {
    label: "Explore sessions",
    value: "Live"
  },
  {
    label: "Compare drivers",
    value: "Lap-by-lap"
  },
  {
    label: "Save analysis",
    value: "Account-ready"
  }
];

const productPillars = [
  {
    title: "Session-first workflow",
    description: "Open a race weekend, inspect pace shape, then move directly into a comparison without exporting data."
  },
  {
    title: "Built for actual questions",
    description: "The app is organized around pace analysis, stint stories, and driver deltas instead of backend diagnostics."
  },
  {
    title: "Operational controls stay intact",
    description: "Ingestion remains available for admins, but the public product stays clean and user-focused."
  }
];

export default async function HomePage() {
  const session = await auth();
  const isAdmin = isViewerAdmin({
    id: session?.user?.id,
    email: session?.user?.email
  });

  return (
    <>
      <header className="topbar">
        <div className="topbar-inner">
          <div className="brand">
            <div className="brand-mark">PL</div>
            <div>
              <p style={{ margin: 0, fontWeight: 700, lineHeight: 1.2 }}>F1 Pace Lab</p>
              <p style={{ margin: 0, color: "#6d7f95", fontSize: "0.83rem" }}>Race pace analysis for the web</p>
            </div>
          </div>
          <div className="topbar-actions">
            <a href="#workspace" className="btn">
              Open workspace
            </a>
            {isAdmin ? (
              <Link className="btn" href="/ingestion">
                Admin ingestion
              </Link>
            ) : null}
          </div>
        </div>
      </header>

      <main className="container">
        <section className="hero-panel">
          <div className="hero-copy">
            <span className="eyebrow">From data pipeline to product surface</span>
            <h1>Turn ingested F1 data into an analysis experience people actually want to use.</h1>
            <p>
              F1 Pace Lab now leads with exploration, comparison, and saved analysis. The ingest machinery stays available, but it no longer dominates the front door.
            </p>
            <div className="hero-actions">
              <a href="#workspace" className="btn btn-primary">
                Start exploring
              </a>
              <a href="#accounts" className="btn">
                See account features
              </a>
            </div>
          </div>

          <div className="hero-side panel">
            <span className="eyebrow">What the product does</span>
            <div className="hero-stat-grid">
              {productStats.map((item) => (
                <article key={item.label} className="hero-stat-card">
                  <p>{item.label}</p>
                  <strong>{item.value}</strong>
                </article>
              ))}
            </div>
            <p className="hero-note">
              Public users get the analysis surface. Signed-in users get ownership. Admins get ingestion control.
            </p>
          </div>
        </section>

        <section className="panel narrative-panel">
          <div className="section-heading">
            <div>
              <span className="eyebrow">Product direction</span>
              <h2>Keep the backend power, change the user story.</h2>
            </div>
          </div>
          <div className="feature-grid">
            {productPillars.map((pillar) => (
              <article key={pillar.title} className="feature-card">
                <h3>{pillar.title}</h3>
                <p>{pillar.description}</p>
              </article>
            ))}
          </div>
        </section>

        <section id="workspace" className="section-stack">
          <div className="section-heading">
            <div>
              <span className="eyebrow">Workspace</span>
              <h2>Explore the data like an app, not a dev console.</h2>
            </div>
            <p>The analysis flow starts with session discovery, then moves into pace story, driver comparison, and coverage confidence.</p>
          </div>
          <SessionExplorer />
          <ComparisonLab />
          <CoveragePanel />
        </section>

        <section id="accounts" className="section-stack">
          <div className="section-heading">
            <div>
              <span className="eyebrow">Accounts</span>
              <h2>Optional sign-in, purposeful permissions.</h2>
            </div>
            <p>Saved views stay user-owned, while ingestion and operator tooling are reserved for admins.</p>
          </div>
          <div className="account-grid">
            <AuthPanel />
            <SavedViewsPanel />
          </div>
        </section>
      </main>
    </>
  );
}
