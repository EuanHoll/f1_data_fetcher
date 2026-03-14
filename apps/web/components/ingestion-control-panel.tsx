"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";

function formatDate(value: number | null) {
  if (!value) {
    return "-";
  }
  return new Date(value).toLocaleString();
}

export function IngestionControlPanel() {
  const pageSize = 120;
  const [currentPage, setCurrentPage] = useState(0);
  const [selectedSeason, setSelectedSeason] = useState<string>("all");
  const [selectedSessionCode, setSelectedSessionCode] = useState<string>("all");
  const [isBusy, setIsBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const data = useQuery(api.sessions.getExplorerData, {
    limit: pageSize,
    offset: currentPage * pageSize,
    seasonYear: selectedSeason === "all" ? undefined : Number(selectedSeason),
    sessionCode: selectedSessionCode === "all" ? undefined : selectedSessionCode,
    order: "oldest"
  });

  useEffect(() => {
    setCurrentPage(0);
  }, [selectedSeason, selectedSessionCode]);

  const rows = useMemo(() => (data?.rows ?? []).filter((row) => row.ingestStatus === "pending"), [data]);
  const pendingRowsForBatch = useMemo(
    () => rows.map((row) => ({ year: row.seasonYear, round: row.round, sessionCode: row.sessionCode })).filter((row) => row.year !== null && row.round !== null),
    [rows]
  );

  const runDiagnostics =
    data?.runDiagnostics ??
    {
      runningCount: 0,
      runningRuns: [] as Array<{ id: string; source: string; startedAt: number; message: string | null }>,
      recentRuns: [] as Array<{ id: string; source: string; status: string; startedAt: number; completedAt: number | null; message: string | null }>
    };

  async function postControl(payload: Record<string, unknown>) {
    setIsBusy(true);
    setMessage("Submitting ingest command...");
    try {
      const response = await fetch("/api/ingest/control", {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify(payload)
      });

      const result = (await response.json()) as Record<string, unknown>;
      if (!response.ok) {
        throw new Error(String(result.error ?? "Failed to submit ingest command"));
      }

      const queued = Number(result.queued ?? 0);
      const pid = result.pid ? ` (pid ${String(result.pid)})` : "";
      const jobId = result.jobId ? ` job ${String(result.jobId)}` : "";
      setMessage(`Queued ${queued} session(s)${jobId}${pid}.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unknown ingest control error");
    } finally {
      setIsBusy(false);
    }
  }

  if (!data) {
    return (
      <section className="panel" style={{ marginTop: "1rem" }}>
        <h2 style={{ marginTop: 0 }}>Ingestion Control</h2>
        <p style={{ marginBottom: 0, color: "#5f7189" }}>Loading pending queue...</p>
      </section>
    );
  }

  return (
    <>
      <header className="topbar">
        <div className="topbar-inner">
          <div className="brand">
            <div className="brand-mark">PL</div>
            <div>
              <p style={{ margin: 0, fontWeight: 700, lineHeight: 1.2 }}>F1 Pace Lab</p>
              <p style={{ margin: 0, color: "#6d7f95", fontSize: "0.83rem" }}>Ingestion Control</p>
            </div>
          </div>
          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
            <Link className="btn" href="/">
              Back to Explorer
            </Link>
          </div>
        </div>
      </header>

      <main className="container">
        <section className="panel" style={{ marginBottom: "1rem" }}>
          <h1 style={{ margin: "0 0 0.35rem", fontSize: "1.8rem" }}>Ingestion Control Center</h1>
          <p style={{ margin: 0, color: "#42566f" }}>
            Track pending sessions, inspect running ingest activity, and queue single or bulk ingest runs with one click.
          </p>
        </section>

        <section className="grid-4" style={{ marginBottom: "1rem" }}>
          <article className="kpi-card">
            <p className="kpi-label">Pending (Filtered)</p>
            <p className="kpi-value" style={{ color: "var(--warn)" }}>
              {data.stats.pendingSessions}
            </p>
          </article>
          <article className="kpi-card">
            <p className="kpi-label">Running Jobs</p>
            <p className="kpi-value">{runDiagnostics.runningCount}</p>
          </article>
          <article className="kpi-card">
            <p className="kpi-label">Ready (Filtered)</p>
            <p className="kpi-value" style={{ color: "var(--ok)" }}>
              {data.stats.readySessions}
            </p>
          </article>
          <article className="kpi-card">
            <p className="kpi-label">Failed (Filtered)</p>
            <p className="kpi-value" style={{ color: "#9a2f2f" }}>
              {data.stats.failedSessions}
            </p>
          </article>
        </section>

        <section className="panel" style={{ marginBottom: "1rem" }}>
          <div className="select-row" style={{ marginBottom: "0.75rem" }}>
            <select className="select" value={selectedSeason} onChange={(event) => setSelectedSeason(event.target.value)}>
              <option value="all">All seasons</option>
              {data.facets.seasons.map((season) => (
                <option key={season} value={String(season)}>
                  {season}
                </option>
              ))}
            </select>

            <select className="select" value={selectedSessionCode} onChange={(event) => setSelectedSessionCode(event.target.value)}>
              <option value="all">All sessions</option>
              {data.facets.sessionCodes.map((code) => (
                <option key={code} value={code}>
                  {code}
                </option>
              ))}
            </select>

            <button
              className="btn"
              disabled={isBusy || pendingRowsForBatch.length === 0}
              onClick={() => void postControl({ action: "ingest_batch", sessions: pendingRowsForBatch })}
            >
              Ingest This Page ({pendingRowsForBatch.length})
            </button>

            <button
              className="btn btn-primary"
              disabled={isBusy || data.stats.pendingSessions === 0}
              onClick={() =>
                void postControl({
                  action: "ingest_filtered_pending",
                  seasonYear: selectedSeason === "all" ? undefined : Number(selectedSeason),
                  sessionCode: selectedSessionCode === "all" ? undefined : selectedSessionCode
                })
              }
            >
              Ingest All Filtered ({data.stats.pendingSessions})
            </button>
          </div>

          {message ? <p style={{ margin: 0, color: "#405b77" }}>{message}</p> : null}
        </section>

        <section className="panel" style={{ marginBottom: "1rem" }}>
          <h2 style={{ marginTop: 0 }}>Pending Sessions</h2>
          <div className="table-wrap">
            <table className="table table-compact" style={{ minWidth: 860 }}>
              <thead>
                <tr>
                  <th>Season</th>
                  <th>Round</th>
                  <th>Event</th>
                  <th>Session</th>
                  <th>Start</th>
                  <th>Last Fetch</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id ?? `${row.seasonYear}-${row.round}-${row.sessionCode}-${row.eventName}`}>
                    <td>{row.seasonYear ?? "-"}</td>
                    <td>{row.round ?? "-"}</td>
                    <td>{row.eventName}</td>
                    <td>
                      {row.sessionName} ({row.sessionCode})
                    </td>
                    <td className="mono">{formatDate(row.startsAt)}</td>
                    <td className="mono">{formatDate(row.lastFetchedAt ?? null)}</td>
                    <td>
                      <button
                        className="btn"
                        disabled={
                          isBusy ||
                          row.seasonYear === null ||
                          row.round === null
                        }
                        onClick={() =>
                          void postControl({
                            action: "ingest_session",
                            year: row.seasonYear,
                            round: row.round,
                            sessionCode: row.sessionCode
                          })
                        }
                      >
                        Ingest
                      </button>
                    </td>
                  </tr>
                ))}
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={7} style={{ color: "#6b7e94" }}>
                      No pending sessions for this filter.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "0.8rem", gap: "0.6rem", flexWrap: "wrap" }}>
            <span className="mono" style={{ color: "#5f7189", fontSize: "0.88rem" }}>
              showing {data.pagination.offset + 1}-{Math.min(data.pagination.offset + data.pagination.limit, data.pagination.total)} of {data.pagination.total}
            </span>
            <div style={{ display: "flex", gap: "0.5rem" }}>
              <button className="btn" disabled={!data.pagination.hasPrevPage || isBusy} onClick={() => setCurrentPage((page) => Math.max(page - 1, 0))}>
                Previous
              </button>
              <button className="btn" disabled={!data.pagination.hasNextPage || isBusy} onClick={() => setCurrentPage((page) => page + 1)}>
                Next
              </button>
            </div>
          </div>
        </section>

        <section className="session-explorer-grid" style={{ marginBottom: "1rem" }}>
          <article className="panel">
            <h3 style={{ marginTop: 0 }}>Running Ingestion Runs</h3>
            <div className="table-wrap">
              <table className="table table-compact" style={{ minWidth: 560 }}>
                <thead>
                  <tr>
                    <th>Source</th>
                    <th>Started</th>
                    <th>Message</th>
                  </tr>
                </thead>
                <tbody>
                  {runDiagnostics.runningRuns.map((run) => (
                    <tr key={run.id}>
                      <td>{run.source}</td>
                      <td className="mono">{formatDate(run.startedAt)}</td>
                      <td>{run.message ?? "-"}</td>
                    </tr>
                  ))}
                  {runDiagnostics.runningRuns.length === 0 ? (
                    <tr>
                      <td colSpan={3} style={{ color: "#6b7e94" }}>
                        No running ingestion run at the moment.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </article>

          <article className="panel">
            <h3 style={{ marginTop: 0 }}>Recent Ingestion Activity</h3>
            <div className="table-wrap" style={{ maxHeight: 360 }}>
              <table className="table table-compact" style={{ minWidth: 560 }}>
                <thead>
                  <tr>
                    <th>Status</th>
                    <th>Source</th>
                    <th>Completed</th>
                  </tr>
                </thead>
                <tbody>
                  {runDiagnostics.recentRuns.map((run) => (
                    <tr key={run.id}>
                      <td>
                        <span className="pill" style={{ color: run.status === "succeeded" ? "var(--ok)" : run.status === "failed" ? "#9a2f2f" : "var(--warn)" }}>
                          {run.status}
                        </span>
                      </td>
                      <td>{run.source}</td>
                      <td className="mono">{formatDate(run.completedAt ?? run.startedAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </article>
        </section>
      </main>
    </>
  );
}
