"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

export function SessionExplorer() {
  const pageSize = 80;
  const [currentPage, setCurrentPage] = useState(0);
  const [selectedSeason, setSelectedSeason] = useState<string>("all");
  const [selectedSessionCode, setSelectedSessionCode] = useState<string>("all");
  const [order, setOrder] = useState<"newest" | "oldest">("newest");

  const [seasonMenuOpen, setSeasonMenuOpen] = useState(false);
  const [sessionCodeMenuOpen, setSessionCodeMenuOpen] = useState(false);
  const [orderMenuOpen, setOrderMenuOpen] = useState(false);

  const seasonMenuRef = useRef<HTMLDivElement | null>(null);
  const sessionCodeMenuRef = useRef<HTMLDivElement | null>(null);
  const orderMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function onPointerDown(event: MouseEvent) {
      if (!seasonMenuRef.current?.contains(event.target as Node)) setSeasonMenuOpen(false);
      if (!sessionCodeMenuRef.current?.contains(event.target as Node)) setSessionCodeMenuOpen(false);
      if (!orderMenuRef.current?.contains(event.target as Node)) setOrderMenuOpen(false);
    }
    if (seasonMenuOpen || sessionCodeMenuOpen || orderMenuOpen) {
      window.addEventListener("mousedown", onPointerDown);
    }
    return () => window.removeEventListener("mousedown", onPointerDown);
  }, [seasonMenuOpen, sessionCodeMenuOpen, orderMenuOpen]);

  const rawData = useQuery(api.sessions.getExplorerData, {
    limit: pageSize,
    offset: currentPage * pageSize,
    seasonYear: selectedSeason === "all" ? undefined : Number(selectedSeason),
    sessionCode: selectedSessionCode === "all" ? undefined : selectedSessionCode,
    order,
    excludeFuture: true
  });

  const [data, setData] = useState(rawData);
  useEffect(() => {
    if (rawData !== undefined) {
      setData(rawData);
    }
  }, [rawData]);
  const [selectedSessionId, setSelectedSessionId] = useState<string>("auto");

  const baseRows = useMemo(() => {
    if (!data) {
      return [];
    }
    return data.rows.length ? data.rows : data.sampleRows;
  }, [data]);

  const sessionCodeOptions = useMemo(() => data?.facets.sessionCodes ?? [], [data]);

  const rows = useMemo(() => baseRows, [baseRows]);

  useEffect(() => {
    if (rows.length === 0) {
      setSelectedSessionId("auto");
      return;
    }

    setSelectedSessionId((current) => {
      if (current === "auto") {
        return current;
      }
      return rows.some((row) => row.id === current) ? current : "auto";
    });
  }, [rows]);

  const activeSessionId = useMemo(() => {
    if (selectedSessionId !== "auto") {
      return selectedSessionId;
    }
    const firstWithId = rows.find((row) => !!row.id);
    return firstWithId?.id ?? null;
  }, [rows, selectedSessionId]);

  const rawLapStory = useQuery(
    api.sessions.getSessionLapStory,
    activeSessionId ? { sessionId: activeSessionId as any, limitRows: 20 } : "skip"
  );
  const isLapStoryLoading = activeSessionId && rawLapStory === undefined;
  
  const [lapStory, setLapStory] = useState(rawLapStory);
  useEffect(() => {
    setLapStory(undefined);
  }, [activeSessionId]);

  useEffect(() => {
    if (rawLapStory !== undefined) {
      setLapStory(rawLapStory);
    }
  }, [rawLapStory, activeSessionId]);

  const chartSeries = useMemo(() => lapStory?.series ?? [], [lapStory]);
  const topLapRows = useMemo(() => (lapStory?.topRows ?? []).slice(0, 12), [lapStory]);
  const chartModel = useMemo(() => {
    if (chartSeries.length === 0) {
      return null;
    }

    const allPoints = chartSeries.flatMap((series) => series.points);
    const allMs = allPoints.map((point) => point.lapTimeMs);
    const allLapNumbers = allPoints.map((point) => point.lapNumber);
    const minMs = Math.min(...allMs);
    const maxMs = Math.max(...allMs);
    const minLapNumber = Math.min(...allLapNumbers);
    const maxLapNumber = Math.max(...allLapNumbers);
    const range = Math.max(maxMs - minMs, 1);
    const lapRange = Math.max(maxLapNumber - minLapNumber, 1);
    const palette = ["#0057ff", "#ff6b00"];
    const chartWidth = 640;
    const chartHeight = 240;
    const paddingLeft = 64;
    const paddingRight = 20;
    const paddingTop = 18;
    const paddingBottom = 34;
    const innerWidth = chartWidth - paddingLeft - paddingRight;
    const innerHeight = chartHeight - paddingTop - paddingBottom;
    const yTicks = Array.from({ length: 4 }, (_, index) => {
      const ratio = index / 3;
      const value = maxMs - range * ratio;
      return {
        value: Math.round(value),
        y: paddingTop + innerHeight * ratio
      };
    });
    const xTicks = Array.from({ length: 4 }, (_, index) => {
      const ratio = index / 3;
      const lapNumber = Math.round(minLapNumber + lapRange * ratio);
      return {
        label: `L${lapNumber}`,
        x: paddingLeft + innerWidth * ratio
      };
    });

    const series = chartSeries.map((entry, index) => {
      const points = entry.points.map((point) => {
        const x = paddingLeft + ((point.lapNumber - minLapNumber) / lapRange) * innerWidth;
        const y = paddingTop + clamp(((maxMs - point.lapTimeMs) / range) * innerHeight, 0, innerHeight);
        return {
          x,
          y,
          lapNumber: point.lapNumber,
          lapTimeMs: point.lapTimeMs
        };
      });

      return {
        driverCode: entry.driverCode,
        color: palette[index] ?? "#334155",
        points,
        polyline: points.map((point) => `${point.x},${point.y}`).join(" ")
      };
    });

    return {
      chartWidth,
      chartHeight,
      paddingLeft,
      paddingRight,
      paddingTop,
      paddingBottom,
      innerWidth,
      innerHeight,
      yTicks,
      xTicks,
      series
    };
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

  return (
    <div className="session-explorer" style={{ paddingTop: "0.5rem" }}>
      <div style={{ marginBottom: "1.5rem" }}>
        <h2 style={{ margin: 0, fontSize: "2rem", fontWeight: 600 }}>Explore Sessions</h2>
        <p style={{ margin: "0.4rem 0 0", color: "#6b7e94", fontSize: "1rem" }}>
          {data.source === "database"
            ? "Browse the live catalog of F1 sessions and analyze driver lap times."
            : "No ingested sessions yet. Showing sample rows until ingestion is wired."}
        </p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "1rem", marginBottom: "1.2rem", marginTop: "1rem" }}>
        <div>
          <label className="data-label">Season</label>
          <div className="compare-dropdown" ref={seasonMenuRef}>
            <button type="button" className="select compare-dropdown-trigger" onClick={() => setSeasonMenuOpen((o) => !o)}>
              <span className="mono">{selectedSeason === "all" ? "All seasons" : `${selectedSeason} Season`}</span>
              <span className="mono">{seasonMenuOpen ? "-" : "+"}</span>
            </button>
            {seasonMenuOpen ? (
              <div className="compare-dropdown-menu">
                <button type="button" className={`compare-dropdown-action ${selectedSeason === "all" ? "is-active" : ""}`} onClick={() => { setSelectedSeason("all"); setSeasonMenuOpen(false); }}>All seasons</button>
                {seasonsFromFacets.map((year) => (
                  <button key={year} type="button" className={`compare-dropdown-action ${selectedSeason === String(year) ? "is-active" : ""}`} onClick={() => { setSelectedSeason(String(year)); setSeasonMenuOpen(false); }}>{year} Season</button>
                ))}
              </div>
            ) : null}
          </div>
        </div>

        <div>
          <label className="data-label">Session Type</label>
          <div className="compare-dropdown" ref={sessionCodeMenuRef}>
            <button type="button" className="select compare-dropdown-trigger" onClick={() => setSessionCodeMenuOpen((o) => !o)}>
              <span className="mono">{selectedSessionCode === "all" ? "All sessions" : selectedSessionCode}</span>
              <span className="mono">{sessionCodeMenuOpen ? "-" : "+"}</span>
            </button>
            {sessionCodeMenuOpen ? (
              <div className="compare-dropdown-menu">
                <button type="button" className={`compare-dropdown-action ${selectedSessionCode === "all" ? "is-active" : ""}`} onClick={() => { setSelectedSessionCode("all"); setSessionCodeMenuOpen(false); }}>All sessions</button>
                {sessionCodeOptions.map((code) => (
                  <button key={code} type="button" className={`compare-dropdown-action ${selectedSessionCode === code ? "is-active" : ""}`} onClick={() => { setSelectedSessionCode(code); setSessionCodeMenuOpen(false); }}>{code}</button>
                ))}
              </div>
            ) : null}
          </div>
        </div>

        <div>
          <label className="data-label">Sort By</label>
          <div className="compare-dropdown" ref={orderMenuRef}>
            <button type="button" className="select compare-dropdown-trigger" onClick={() => setOrderMenuOpen((o) => !o)}>
              <span className="mono">{order === "newest" ? "Newest first" : "Oldest first"}</span>
              <span className="mono">{orderMenuOpen ? "-" : "+"}</span>
            </button>
            {orderMenuOpen ? (
              <div className="compare-dropdown-menu">
                <button type="button" className={`compare-dropdown-action ${order === "newest" ? "is-active" : ""}`} onClick={() => { setOrder("newest"); setOrderMenuOpen(false); }}>Newest first</button>
                <button type="button" className={`compare-dropdown-action ${order === "oldest" ? "is-active" : ""}`} onClick={() => { setOrder("oldest"); setOrderMenuOpen(false); }}>Oldest first</button>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem", marginBottom: "1rem" }}>
        <article className="panel" style={{ padding: "1.2rem", minHeight: 380, display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: "0.75rem", flexWrap: "wrap", marginBottom: "0.55rem" }}>
            <div>
              <h3 style={{ margin: 0 }}>Lap Time Story</h3>
                <p style={{ margin: "0.3rem 0 0", color: "#647487", fontSize: "0.92rem" }}>
                  {lapStory ? "Top two drivers by lap count in selected session." : "Select a session from the list to explore lap performance."}
                </p>
            </div>
          </div>

          {isLapStoryLoading ? (
            <div style={{ border: "1px dashed var(--panel-border)", background: "rgba(3,8,16,0.3)", padding: "3rem 1rem", textAlign: "center", marginTop: "1rem" }}>
              <p style={{ color: "var(--accent)", margin: 0, fontWeight: 500 }}>Fetching lap data...</p>
            </div>
          ) : !activeSessionId ? (
            <div style={{ border: "1px dashed var(--panel-border)", background: "rgba(3,8,16,0.3)", padding: "3rem 1rem", textAlign: "center", marginTop: "1rem" }}>
              <p style={{ color: "var(--text-secondary)", margin: 0 }}>Select a session from the queue to load driver paces.</p>
            </div>
          ) : !lapStory || !chartModel || chartModel.series.length === 0 ? (
            <div style={{ border: "1px dashed var(--panel-border)", background: "rgba(3,8,16,0.3)", padding: "3rem 1rem", textAlign: "center", marginTop: "1rem" }}>
              <p style={{ color: "var(--text-secondary)", margin: 0 }}>The selected session currently has no lap data ingested.</p>
            </div>
          ) : (
            <>
              <div className="story-chart">
                <svg
                  viewBox={`0 0 ${chartModel.chartWidth} ${chartModel.chartHeight}`}
                  style={{ width: "100%", height: 240 }}
                  aria-label="Pace chart"
                >
                  <rect x="0" y="0" width={chartModel.chartWidth} height={chartModel.chartHeight} fill="rgba(5, 13, 27, 0.95)" rx="10" />
                  {chartModel.yTicks.map((tick) => (
                    <g key={`y-${tick.y}`}>
                      <line
                        x1={chartModel.paddingLeft}
                        y1={tick.y}
                        x2={chartModel.chartWidth - chartModel.paddingRight}
                        y2={tick.y}
                        stroke="rgba(137, 161, 192, 0.18)"
                        strokeWidth="1"
                      />
                      <text x={chartModel.paddingLeft - 10} y={tick.y + 4} textAnchor="end" fill="#7f93ad" fontSize="11">
                        {formatLapMs(tick.value)}
                      </text>
                    </g>
                  ))}
                  {chartModel.xTicks.map((tick) => (
                    <g key={`x-${tick.x}`}>
                      <line
                        x1={tick.x}
                        y1={chartModel.paddingTop}
                        x2={tick.x}
                        y2={chartModel.chartHeight - chartModel.paddingBottom}
                        stroke="rgba(137, 161, 192, 0.12)"
                        strokeWidth="1"
                      />
                      <text x={tick.x} y={chartModel.chartHeight - 10} textAnchor="middle" fill="#7f93ad" fontSize="11">
                        {tick.label}
                      </text>
                    </g>
                  ))}
                  {chartModel.series.map((series) => (
                    <g key={series.driverCode}>
                      <polyline
                        fill="none"
                        stroke={series.color}
                        strokeWidth="3"
                        strokeLinejoin="round"
                        strokeLinecap="round"
                        points={series.polyline}
                      />
                      {series.points.map((point, index) => (
                        <circle
                          key={`${series.driverCode}-${point.lapNumber}-${index}`}
                          cx={point.x}
                          cy={point.y}
                          r="3.5"
                          fill={series.color}
                          stroke="rgba(5, 13, 27, 0.95)"
                          strokeWidth="1.5"
                        />
                      ))}
                    </g>
                  ))}
                </svg>
              </div>
              <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginTop: "0.45rem" }}>
                {chartModel.series.map((series) => (
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
                          No lap rows available for this session yet. The session exists in the catalog, but lap-level data has not been ingested.
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </>
          )}
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
                  <tr 
                    key={row.id ?? `${row.eventName}-${row.sessionCode}-${i}`}
                    onClick={() => { if (row.id) setSelectedSessionId(row.id); }}
                    style={{ 
                      cursor: row.id ? "pointer" : "default",
                      background: activeSessionId === row.id ? "rgba(74, 150, 255, 0.12)" : "",
                      boxShadow: activeSessionId === row.id ? "inset 3px 0 0 var(--accent)" : "",
                      opacity: rawData === undefined ? 0.6 : 1,
                      transition: "opacity 0.2s ease"
                    }}
                  >
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
      </div>

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
    </div>
  );
}
