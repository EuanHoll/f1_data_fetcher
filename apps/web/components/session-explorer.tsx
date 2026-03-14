"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";

function formatDate(value: number | null) {
  if (!value) {
    return "TBD";
  }
  return new Date(value).toLocaleString();
}

function formatDateShort(value: number | null) {
  if (!value) {
    return "-";
  }
  return new Date(value).toLocaleDateString();
}

function statusColor(status: string) {
  if (status === "ready") {
    return "var(--ok)";
  }
  if (status === "failed") {
    return "#9a2f2f";
  }
  return "var(--warn)";
}

function formatLapMs(ms: number | null) {
  if (ms === null) {
    return "-";
  }
  const minutes = Math.floor(ms / 60000);
  const seconds = (ms % 60000) / 1000;
  return `${minutes}:${seconds.toFixed(3).padStart(6, "0")}`;
}

export function SessionExplorer() {
  const pageSize = 80;
  const [currentPage, setCurrentPage] = useState(0);
  const [selectedSeason, setSelectedSeason] = useState<string>("all");
  const [selectedSessionCode, setSelectedSessionCode] = useState<string>("all");
  const [order, setOrder] = useState<"newest" | "oldest">("newest");

  const data = useQuery(api.sessions.getExplorerData, {
    limit: pageSize,
    offset: currentPage * pageSize,
    seasonYear: selectedSeason === "all" ? undefined : Number(selectedSeason),
    sessionCode: selectedSessionCode === "all" ? undefined : selectedSessionCode,
    order
  });
  const seedWeekend = useMutation(api.sessions.seedSampleWeekend);
  const markRefreshed = useMutation(api.ingestion.markSessionRefreshed);

  const [seedMessage, setSeedMessage] = useState<string | null>(null);
  const [refreshMessage, setRefreshMessage] = useState<string | null>(null);
  const [selectedSessionId, setSelectedSessionId] = useState<string>("auto");

  async function onSeed() {
    setSeedMessage("Seeding sample weekend...");
    const result = await seedWeekend({});
    setSeedMessage(`Ready. Added ${result.created} new session(s).`);
  }

  async function onRefreshFirstSession() {
    if (!data || data.rows.length === 0) {
      setRefreshMessage("No database session available yet. Seed or ingest first.");
      return;
    }

    const firstSession = data.rows[0];
    if (!firstSession.id) {
      setRefreshMessage("Session ID is missing.");
      return;
    }

    const result = await markRefreshed({
      sessionId: firstSession.id,
      source: "web-manual-refresh"
    });

    if (result.refreshed) {
      setRefreshMessage(`Session refreshed. Cache valid until ${formatDate(result.cacheExpiresAt)}.`);
      return;
    }

    setRefreshMessage("Skipped fetch because cached data is still valid (historical session policy).");
  }

  const baseRows = useMemo(() => {
    if (!data) {
      return [];
    }
    return data.rows.length ? data.rows : data.sampleRows;
  }, [data]);

  const sessionCodeOptions = useMemo(() => data?.facets.sessionCodes ?? [], [data]);

  const rows = useMemo(() => baseRows, [baseRows]);

  const activeSessionId = useMemo(() => {
    if (selectedSessionId !== "auto") {
      return selectedSessionId;
    }
    const firstWithId = rows.find((row) => row.id !== null);
    return firstWithId?.id ?? null;
  }, [rows, selectedSessionId]);

  const lapStory = useQuery(
    api.sessions.getSessionLapStory,
    activeSessionId ? { sessionId: activeSessionId as any, limitRows: 20 } : "skip"
  );

  const chartSeries = useMemo(() => lapStory?.series ?? [], [lapStory]);
  const topLapRows = useMemo(() => (lapStory?.topRows ?? []).slice(0, 12), [lapStory]);
  const chartPoints = useMemo(() => {
    if (chartSeries.length === 0) {
      return [] as Array<{ driverCode: string; polyline: string; color: string }>;
    }

    const allMs = chartSeries.flatMap((series) => series.points.map((point) => point.lapTimeMs));
    const minMs = Math.min(...allMs);
    const maxMs = Math.max(...allMs);
    const range = Math.max(maxMs - minMs, 1);
    const palette = ["#0057ff", "#ff6b00"];

    return chartSeries.map((series, index) => {
      const polyline = series.points
        .map((point, pointIndex) => {
          const x = series.points.length === 1 ? 50 : (pointIndex / (series.points.length - 1)) * 100;
          const y = 100 - ((point.lapTimeMs - minMs) / range) * 88 - 6;
          return `${x},${y}`;
        })
        .join(" ");

      return {
        driverCode: series.driverCode,
        polyline,
        color: palette[index] ?? "#334155"
      };
    });
  }, [chartSeries]);

  useEffect(() => {
    setCurrentPage(0);
  }, [selectedSeason, selectedSessionCode, order]);

  if (data === undefined) {
    return (
      <section className="panel">
        <h2 style={{ marginTop: 0 }}>Session Explorer</h2>
        <p style={{ marginBottom: 0, color: "#55676a" }}>Loading sessions from Convex...</p>
      </section>
    );
  }

  const seasonsFromFacets = data.facets.seasons;
  const diagnostics =
    data.pendingDiagnostics ??
    {
      pendingNeverAttempted: 0,
      pendingInProgressOrRetried: 0,
      pendingCacheExpired: 0,
      oldestPendingStartsAt: null,
      pendingPreview: [] as Array<{
        id: string;
        seasonYear: number | null;
        round: number | null;
        eventName: string;
        sessionCode: string;
        sessionName: string;
        startsAt: number | null;
        source: string | null;
        lastFetchedAt: number | null;
        cacheExpiresAt: number | null;
      }>
    };
  const pendingHeadline =
    diagnostics.pendingNeverAttempted > 0
      ? `${diagnostics.pendingNeverAttempted} pending sessions were cataloged but never sent to lap ingest yet.`
      : diagnostics.pendingInProgressOrRetried > 0
        ? `${diagnostics.pendingInProgressOrRetried} pending sessions were touched by ingest and still need finalization.`
        : "No pending sessions in the current explorer scope.";

  return (
    <section className="panel session-explorer" style={{ marginTop: "1rem" }}>
      <div className="session-head">
        <div>
          <h2 style={{ margin: 0, fontSize: "1.4rem" }}>Session Explorer</h2>
          <p style={{ margin: "0.28rem 0 0", color: "#5b6d84", fontSize: "0.93rem" }}>
            {data.source === "database"
              ? "Live session catalog from Convex with ingest queue diagnostics."
              : "No ingested sessions yet. Showing sample rows until ingestion is wired."}
          </p>
        </div>
        <div className="session-head-actions">
          <span className="pill" style={{ background: data.source === "database" ? "var(--accent-soft)" : "#fff8e7" }}>
            source: {data.source}
          </span>
          <button onClick={() => void onSeed()} className="btn">
            Seed sample weekend
          </button>
          <button onClick={() => void onRefreshFirstSession()} className="btn">
            Refresh latest session
          </button>
        </div>
      </div>
      {seedMessage ? <p style={{ marginTop: 0, color: "#59696d" }}>{seedMessage}</p> : null}
      {refreshMessage ? <p style={{ marginTop: 0, color: "#59696d" }}>{refreshMessage}</p> : null}

      <div className="select-row" style={{ marginBottom: "0.9rem" }}>
        <select className="select" value={selectedSeason} onChange={(event) => setSelectedSeason(event.target.value)}>
          <option value="all">All seasons</option>
          {seasonsFromFacets.map((year) => (
            <option key={year} value={String(year)}>
              {year} Season
            </option>
          ))}
        </select>

        <select className="select" value={selectedSessionCode} onChange={(event) => setSelectedSessionCode(event.target.value)}>
          <option value="all">All sessions</option>
          {sessionCodeOptions.map((code) => (
            <option key={code} value={code}>
              {code}
            </option>
          ))}
        </select>

        <select className="select" value={order} onChange={(event) => setOrder(event.target.value as "newest" | "oldest")}>
          <option value="newest">Newest first</option>
          <option value="oldest">Oldest first</option>
        </select>

        <select className="select" value={selectedSessionId} onChange={(event) => setSelectedSessionId(event.target.value)}>
          <option value="auto">Auto (first matching session)</option>
          {rows
            .filter((row) => row.id)
            .map((row) => (
              <option key={row.id ?? `${row.eventName}-${row.sessionCode}`} value={row.id ?? ""}>
                {row.seasonYear} R{row.round} {row.sessionCode} - {row.eventName}
              </option>
            ))}
        </select>

        <div className="select mono compare-summary-chip" style={{ display: "grid", alignItems: "center", color: "#5f6e88" }}>
          visible page set: {rows.length}
        </div>
        <div className="select mono compare-summary-chip" style={{ display: "grid", alignItems: "center", color: "#5f6e88" }}>
          filtered catalog: {data.pagination.total}
        </div>
      </div>

      <section className="grid-4" style={{ marginBottom: "1rem" }}>
        <article className="kpi-card">
          <p className="kpi-label">Total Sessions</p>
          <p className="kpi-value">{data.stats.totalSessions}</p>
          <p style={{ margin: "0.28rem 0 0", color: "#6d7d91", fontSize: "0.84rem" }}>Current filtered result set size.</p>
        </article>
        <article className="kpi-card">
          <p className="kpi-label">Ready to Use</p>
          <p className="kpi-value" style={{ color: "var(--ok)" }}>
            {data.stats.readySessions}
          </p>
          <p style={{ margin: "0.28rem 0 0", color: "#6d7d91", fontSize: "0.88rem" }}>Already cached locally and queryable.</p>
        </article>
        <article className="kpi-card">
          <p className="kpi-label">Pending</p>
          <p className="kpi-value" style={{ color: "var(--warn)" }}>
            {data.stats.pendingSessions}
          </p>
          <p style={{ margin: "0.28rem 0 0", color: "#6d7d91", fontSize: "0.84rem" }}>Sessions still waiting on ingest completion.</p>
        </article>
        <article className="kpi-card">
          <p className="kpi-label">Failed</p>
          <p className="kpi-value" style={{ color: "#9a2f2f" }}>
            {data.stats.failedSessions}
          </p>
          <p style={{ margin: "0.28rem 0 0", color: "#6d7d91", fontSize: "0.84rem" }}>Sessions that ended in failed ingest state.</p>
        </article>
      </section>

      <section className="panel" style={{ marginBottom: "1rem", padding: "0.85rem" }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: "0.75rem", flexWrap: "wrap" }}>
          <div>
            <h3 style={{ margin: 0 }}>Ingest Queue Diagnostics</h3>
            <p style={{ margin: "0.3rem 0 0", color: "#5c6f86", fontSize: "0.9rem" }}>{pendingHeadline}</p>
          </div>
          <span className="pill mono" style={{ background: "var(--accent-soft)" }}>
            latest run: {data.stats.ingestRunStatus}
          </span>
        </div>

        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginTop: "0.6rem" }}>
          <span className="pill mono">never attempted: {diagnostics.pendingNeverAttempted}</span>
          <span className="pill mono">in progress/retried: {diagnostics.pendingInProgressOrRetried}</span>
          <span className="pill mono">cache expired: {diagnostics.pendingCacheExpired}</span>
          <span className="pill mono">oldest pending: {formatDateShort(diagnostics.oldestPendingStartsAt)}</span>
        </div>

        <div className="table-wrap" style={{ marginTop: "0.75rem" }}>
          <table className="table table-compact" style={{ minWidth: 680 }}>
            <thead>
              <tr>
                <th>Session</th>
                <th>Start</th>
                <th>Last Fetch</th>
                <th>Source</th>
              </tr>
            </thead>
            <tbody>
              {diagnostics.pendingPreview.map((row) => (
                <tr key={row.id}>
                  <td>
                    <strong>{row.seasonYear ?? "-"} R{row.round ?? "-"}</strong> {row.sessionCode} - {row.eventName}
                  </td>
                  <td className="mono">{formatDate(row.startsAt)}</td>
                  <td className="mono">{formatDate(row.lastFetchedAt)}</td>
                  <td>{row.source ?? "catalog"}</td>
                </tr>
              ))}
              {diagnostics.pendingPreview.length === 0 ? (
                <tr>
                  <td colSpan={4} style={{ color: "#6c7d90" }}>
                    No pending sessions in this filter scope.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <section className="session-explorer-grid" style={{ marginBottom: "1rem" }}>
        <article className="panel" style={{ padding: "0.85rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: "0.75rem", flexWrap: "wrap", marginBottom: "0.55rem" }}>
            <div>
              <h3 style={{ margin: 0 }}>Lap Time Story</h3>
                <p style={{ margin: "0.3rem 0 0", color: "#647487", fontSize: "0.92rem" }}>
                  {lapStory ? "Top two drivers by lap count in selected session." : "No lap series available yet. This usually means the selected session has catalog data but no lap ingest yet."}
                </p>
            </div>
            <span className="pill mono" style={{ background: "var(--accent-soft)" }}>
              query: sessions.getSessionLapStory
            </span>
          </div>
          <div className="story-chart">
            <svg viewBox="0 0 100 100" style={{ width: "100%", height: 210 }} aria-label="Pace chart">
              <polyline fill="none" stroke="#e7eef9" strokeWidth="0.8" points="0,94 100,94" />
              {chartPoints.map((series) => (
                <polyline key={series.driverCode} fill="none" stroke={series.color} strokeWidth="2.2" points={series.polyline} />
              ))}
            </svg>
          </div>
          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginTop: "0.45rem" }}>
            {chartPoints.map((series) => (
              <span key={series.driverCode} className="pill mono">
                <span style={{ width: 8, height: 8, borderRadius: 999, background: series.color, display: "inline-block" }} />
                {series.driverCode}
              </span>
            ))}
          </div>
          <p className="mono" style={{ margin: "0.45rem 0 0", color: "#617286", fontSize: "0.85rem" }}>
            best: {formatLapMs(lapStory?.bestLapMs ?? null)} | avg: {formatLapMs(lapStory?.avgLapMs ?? null)} | laps: {lapStory?.totalLaps ?? 0}
          </p>

          <div className="table-wrap" style={{ marginTop: "0.65rem", maxHeight: 290 }}>
            <table className="table table-compact" style={{ minWidth: 620 }}>
              <thead>
                <tr>
                  <th>Driver</th>
                  <th>Lap</th>
                  <th>Lap Time</th>
                  <th>Compound</th>
                  <th>Stint</th>
                  <th>Delta to Best</th>
                </tr>
              </thead>
              <tbody>
                {topLapRows.map((row, i) => (
                  <tr key={`${row.driverCode}-${row.lapNumber}-${i}`}>
                    <td>
                      <strong>{row.driverCode}</strong>
                    </td>
                    <td>{row.lapNumber}</td>
                    <td className="mono">{formatLapMs(row.lapTimeMs)}</td>
                    <td>{row.compound ?? "-"}</td>
                    <td>{row.stint ?? "-"}</td>
                    <td className="mono" style={{ color: row.deltaToBestMs === 0 ? "var(--ok)" : "var(--warn)" }}>
                      {row.deltaToBestMs === null ? "-" : `+${(row.deltaToBestMs / 1000).toFixed(3)}s`}
                    </td>
                  </tr>
                ))}
                {lapStory && topLapRows.length === 0 ? (
                  <tr>
                    <td colSpan={6} style={{ color: "#6c7d90" }}>
                      No lap rows available for this session yet. The session exists in the catalog, but lap-level data has not been ingested into the comparison store.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </article>

        <article className="panel" style={{ padding: "0.85rem" }}>
          <div>
            <h3 style={{ margin: 0 }}>Session Queue</h3>
            <p style={{ margin: "0.3rem 0 0", color: "#647487", fontSize: "0.92rem" }}>
              Compact view of sessions in the current filter and sort scope.
            </p>
          </div>
          <div className="table-wrap" style={{ marginTop: "0.65rem", maxHeight: 560 }}>
            <table className="table table-compact" style={{ minWidth: 760 }}>
              <thead>
                <tr>
                  <th>Season</th>
                  <th>Round</th>
                  <th>Event</th>
                  <th>Session</th>
                  <th>Start</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => (
                  <tr key={row.id ?? `${row.eventName}-${row.sessionCode}-${i}`}>
                    <td>{row.seasonYear ?? "-"}</td>
                    <td>{row.round ?? "-"}</td>
                    <td>
                      <strong>{row.eventName}</strong>
                      <div style={{ color: "#6b7e81", fontSize: "0.82rem" }}>{row.location ?? "Location unknown"}</div>
                    </td>
                    <td>
                      {row.sessionName} <span style={{ color: "#6b7e81" }}>({row.sessionCode})</span>
                    </td>
                    <td className="mono">{formatDate(row.startsAt)}</td>
                    <td>
                      <span className="pill" style={{ color: statusColor(row.ingestStatus) }}>
                        {row.ingestStatus}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>
      </section>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "0.8rem", gap: "0.6rem", flexWrap: "wrap" }}>
        <span className="mono" style={{ color: "#5f7189", fontSize: "0.88rem" }}>
          showing {data.pagination.offset + 1}-{Math.min(data.pagination.offset + data.pagination.limit, data.pagination.total)} of {data.pagination.total}
        </span>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <button className="btn" disabled={!data.pagination.hasPrevPage} onClick={() => setCurrentPage((page) => Math.max(page - 1, 0))}>
            Previous
          </button>
          <button className="btn" disabled={!data.pagination.hasNextPage} onClick={() => setCurrentPage((page) => page + 1)}>
            Next
          </button>
        </div>
      </div>
    </section>
  );
}
