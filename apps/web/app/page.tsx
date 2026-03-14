import Link from "next/link";
import { AppShell } from "@/components/app-shell";

const productStats = [
  { label: "Module 02", value: "Explore" },
  { label: "Module 03", value: "Compare" },
  { label: "Module 04", value: "Workspace" }
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
  return (
    <AppShell activeModule="home">
      <div className="container page-stack">
        <section className="hero-panel">
          <div className="hero-copy">
            <span className="eyebrow">Overview Display</span>
            <h1>Turn ingested telemetry into actionable analysis.</h1>
            <p>
              The product now leads with session discovery, comparison, and workspace framing. Ingestion machinery stays available in the background for operators.
            </p>
            <div className="hero-actions">
              <Link href="/explore" className="btn btn-primary">INITIATE EXPLORATION</Link>
              <Link href="/compare" className="btn">OPEN COMPARISON LAB</Link>
            </div>
          </div>

          <div className="hero-side panel">
            <span className="eyebrow">Active Modules</span>
            <div className="hero-stat-grid">
              {productStats.map((item) => (
                <article key={item.label} className="hero-stat-card">
                  <p>{item.label}</p>
                  <strong>{item.value}</strong>
                </article>
              ))}
            </div>
            <p className="hero-note">Guests can inspect the analysis surface. Authenticated users unlock workspace identity. Admins retain systems access.</p>
          </div>
        </section>

        <section className="panel narrative-panel">
          <div className="section-heading">
            <div>
              <span className="eyebrow">Module Briefing</span>
              <h2>Keep backend power, change the user story.</h2>
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

        <section className="panel narrative-panel">
          <div className="section-heading">
            <div>
              <span className="eyebrow">Mission Routing</span>
              <h2>Route directly into the live product modules.</h2>
            </div>
            <p>The redesigned front end moves core workflows into dedicated routes so the product reads like a control surface instead of a stacked demo page.</p>
          </div>
          <div className="feature-grid">
            <article className="feature-card">
              <h3>Session Explorer</h3>
              <p>Filter live sessions, inspect ingest state, and review lap-story diagnostics in a dedicated page.</p>
              <div className="hero-actions">
                <Link href="/explore" className="btn btn-primary">Open Explore</Link>
              </div>
            </article>
            <article className="feature-card">
              <h3>Comparison Lab</h3>
              <p>Build multi-session, multi-driver overlays with the current Convex-backed comparison engine.</p>
              <div className="hero-actions">
                <Link href="/compare" className="btn btn-primary">Open Compare</Link>
              </div>
            </article>
            <article className="feature-card">
              <h3>Workspace Archive</h3>
              <p>Reserve space for saved views now, then layer in persistence once the route and shell are stable.</p>
              <div className="hero-actions">
                <Link href="/saved" className="btn btn-primary">Open Workspace</Link>
              </div>
            </article>
          </div>
        </section>

      </div>
    </AppShell>
  );
}
