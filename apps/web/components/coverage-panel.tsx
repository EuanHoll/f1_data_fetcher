"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";

function formatDate(value: number | null) {
  if (!value) {
    return "-";
  }
  return new Date(value).toLocaleString();
}

export function CoveragePanel() {
  const coverage = useQuery(api.catalog.getCoverage, {});

  if (!coverage) {
    return (
      <section className="panel" style={{ marginBottom: "1rem" }}>
        <h2 style={{ marginTop: 0 }}>Coverage</h2>
        <p style={{ margin: 0, color: "#5e7088" }}>Loading catalog coverage...</p>
      </section>
    );
  }

  return (
    <section className="panel" style={{ marginBottom: "1rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: "0.75rem", flexWrap: "wrap" }}>
        <h2 style={{ margin: 0 }}>Coverage Snapshot</h2>
        <span className="pill mono">seasons: {coverage.seasonRows.length}</span>
      </div>

      <div className="table-wrap" style={{ marginTop: "0.7rem" }}>
        <table className="table" style={{ minWidth: 760 }}>
          <thead>
            <tr>
              <th>Season</th>
              <th>Events</th>
              <th>Sessions</th>
              <th>Ready</th>
              <th>Lap Rows</th>
            </tr>
          </thead>
          <tbody>
            {coverage.seasonRows.map((row) => (
              <tr key={row.seasonYear}>
                <td>{row.seasonYear}</td>
                <td className="mono">{row.events}</td>
                <td className="mono">{row.sessions}</td>
                <td className="mono" style={{ color: row.readySessions > 0 ? "var(--ok)" : "#6d7f97" }}>
                  {row.readySessions}
                </td>
                <td className="mono">{row.lapRows ?? "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ marginTop: "0.9rem", display: "grid", gap: "0.5rem" }}>
        <h3 style={{ margin: 0, fontSize: "1rem" }}>Recent Ingestion Runs</h3>
        {coverage.recentRuns.map((run) => (
          <div key={run.id} style={{ border: "1px solid var(--line)", borderRadius: 10, padding: "0.55rem 0.65rem" }}>
            <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap" }}>
              <span className="pill mono">{run.source}</span>
              <span className="pill" style={{ color: run.status === "succeeded" ? "var(--ok)" : run.status === "failed" ? "#9a2f2f" : "var(--warn)" }}>
                {run.status}
              </span>
              <span className="mono" style={{ color: "#65768d", fontSize: "0.85rem" }}>
                {formatDate(run.completedAt ?? run.startedAt)}
              </span>
            </div>
            {run.message ? <p style={{ margin: "0.35rem 0 0", color: "#5d6f88" }}>{run.message}</p> : null}
          </div>
        ))}
      </div>
    </section>
  );
}
