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
    <main className="container" style={{ paddingTop: "2rem", paddingBottom: "2rem" }}>
      <section className="panel" style={{ marginBottom: "1rem" }}>
        <p style={{ margin: 0, fontSize: "0.8rem", letterSpacing: "0.08em", textTransform: "uppercase", color: "#6b7e81" }}>
          F1 Data Fetcher Web Migration
        </p>
        <h1 style={{ margin: "0.4rem 0 0.5rem", fontSize: "2rem" }}>F1 Pace Lab - Implementation Kickoff</h1>
        <p style={{ margin: 0, color: "#314144" }}>
          This app is now wired for local self-hosted Convex. Next step is to push Convex functions and build the first real session explorer query flow.
        </p>
      </section>

      <section className="panel" style={{ marginBottom: "1rem" }}>
        <h2 style={{ marginTop: 0 }}>Environment Health</h2>
        <div style={{ display: "grid", gap: "0.6rem" }}>
          {checks.map((check) => (
            <div key={check.label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", border: "1px solid var(--line)", borderRadius: "10px", padding: "0.65rem 0.8rem" }}>
              <strong>{check.label}</strong>
              <span className="pill" style={{ background: check.good ? "var(--accent-soft)" : "#fff0f0", borderColor: check.good ? "#b6e5d6" : "#f2c7c7" }}>
                <span style={{ color: check.good ? "#14624d" : "#9f2b2b", fontWeight: 700 }}>{check.good ? "OK" : "Needs setup"}</span>
                <span style={{ color: "#526467" }}>{check.value}</span>
              </span>
            </div>
          ))}
        </div>
      </section>

      <section className="panel">
        <h2 style={{ marginTop: 0 }}>What is ready</h2>
        <ul style={{ margin: 0, paddingLeft: "1.2rem", display: "grid", gap: "0.4rem" }}>
          <li>Next.js app scaffold under <code>apps/web</code></li>
          <li>Convex schema and initial queries under <code>apps/web/convex</code></li>
          <li>Workspace scripts to run web and Convex locally from repo root</li>
        </ul>
      </section>
    </main>
  );
}
