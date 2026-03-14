import { AppShell } from "@/components/app-shell";

const placeholderCards = [
  {
    title: "QUALI_DELTA_BOARD",
    description: "Reserved workspace for saved qualifying overlays and sector-focused comparison presets.",
    tags: ["QUAL", "DELTA", "PENDING"]
  },
  {
    title: "RACE_STINT_MATRIX",
    description: "Placeholder archive tile for cross-stint pace studies once persistent saved states are wired.",
    tags: ["RACE", "STINT", "PENDING"]
  }
];

export default async function SavedPage() {
  return (
    <AppShell activeModule="saved">
      <div className="container dashboard-grid split-view page-stack">
        <aside className="side-panel">
          <div className="panel">
            <div className="panel-header">
              <h3>&gt; USER_WORKSPACE</h3>
            </div>
            <div className="panel-content">
              <ul className="workspace-menu">
                <li className="active">&gt; SAVED_VIEWS</li>
                <li>&gt; CUSTOM_PRESETS</li>
                <li>&gt; SHARED_BOARDS</li>
              </ul>
            </div>
          </div>

          <div className="panel status-panel">
            <div className="panel-header">
              <h3>&gt; ACCOUNT_STATUS</h3>
            </div>
            <div className="panel-content">
              <div className="mono-text">ACCESS_LEVEL: <span className="badge fp">WORKSPACE_READY</span></div>
              <p className="mono-text workspace-note">Archive wiring comes in a later slice. This route establishes the shell, IA, and placeholder workspace footprint.</p>
            </div>
          </div>
        </aside>

        <section className="panel">
          <div className="panel-header">
            <h2>&gt; WORKSPACE_ARCHIVE // DIRECTORY: /SAVED_VIEWS/</h2>
            <div className="panel-controls">
              <button className="btn btn-icon" disabled>
                [+ NEW]
              </button>
              <button className="btn btn-icon" disabled>
                [FILTER]
              </button>
            </div>
          </div>
          <div className="panel-content layout-grid">
            <div className="card card-placeholder">
              <div className="card-header">
                <h4>ARCHIVE_LINK_PENDING</h4>
                <span className="date-stamp">placeholder mode</span>
              </div>
              <div className="card-body">
                <p className="mono-text">
                  Saved views are intentionally deferred in this pass. The page is live now so navigation, shell styling, and workspace framing match the redesign.
                </p>
              </div>
            </div>

            {placeholderCards.map((card) => (
              <div key={card.title} className="card">
                <div className="card-header">
                  <h4>{card.title}</h4>
                  <span className="date-stamp">reserved slot</span>
                </div>
                <div className="card-body">
                  <p className="mono-text">{card.description}</p>
                  <div className="tags">
                    {card.tags.map((tag) => (
                      <span key={tag} className="tag">
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </AppShell>
  );
}
