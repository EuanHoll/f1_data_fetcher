"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";

const palette = ["#1d4ed8", "#c2410c", "#0f766e", "#7c3aed", "#be123c", "#4d7c0f", "#0369a1", "#b45309"];
const dashPatterns = ["none", "10 6", "3 5", "14 5 3 5", "2 4", "16 6"];

function formatLapMs(ms: number | null) {
  if (ms === null) {
    return "-";
  }
  const minutes = Math.floor(ms / 60000);
  const seconds = (ms % 60000) / 1000;
  return `${minutes}:${seconds.toFixed(3).padStart(6, "0")}`;
}

function formatDelta(ms: number | null) {
  if (ms === null) {
    return "-";
  }
  return `${ms > 0 ? "+" : ""}${(ms / 1000).toFixed(3)}s`;
}

function toggleValue(current: string[], value: string) {
  return current.includes(value) ? current.filter((item) => item !== value) : [...current, value];
}

function displayDriverLabel(driverCode: string, driverName?: string | null) {
  return driverName ? `${driverName} (${driverCode})` : driverCode;
}

export function ComparisonLab() {
  const [seasonYears, setSeasonYears] = useState<number[]>([]);
  const [sessionCode, setSessionCode] = useState<string | undefined>(undefined);
  const [location, setLocation] = useState<string>("all");
  const [seasonMenuOpen, setSeasonMenuOpen] = useState(false);
  const [selectedSessionIds, setSelectedSessionIds] = useState<string[]>([]);
  const [selectedDriverCodes, setSelectedDriverCodes] = useState<string[]>([]);
  const hasAutoSelectedSessions = useRef(false);
  const hasAutoSelectedDrivers = useRef(false);
  const seasonMenuRef = useRef<HTMLDivElement | null>(null);
  const lastReadySessionsRef = useRef<typeof readySessions>();

  const readySessions = useQuery(api.sessions.getReadySessionsForCompare, {
    limit: 1500,
    seasonYears: seasonYears.length > 0 ? seasonYears : undefined,
    sessionCode
  });

  if (readySessions) {
    lastReadySessionsRef.current = readySessions;
  }

  const resolvedReadySessions = readySessions ?? lastReadySessionsRef.current;

  const seasonSummary = useMemo(() => {
    if (seasonYears.length === 0) {
      return "All seasons";
    }
    return seasonYears.slice().sort((a, b) => b - a).join(", ");
  }, [seasonYears]);

  useEffect(() => {
    function onPointerDown(event: MouseEvent) {
      if (!seasonMenuRef.current?.contains(event.target as Node)) {
        setSeasonMenuOpen(false);
      }
    }

    if (seasonMenuOpen) {
      window.addEventListener("mousedown", onPointerDown);
    }

    return () => window.removeEventListener("mousedown", onPointerDown);
  }, [seasonMenuOpen]);

  const locationOptions = useMemo(() => {
    return Array.from(new Set((resolvedReadySessions?.rows ?? []).map((row) => row.location).filter((value): value is string => Boolean(value)))).sort();
  }, [resolvedReadySessions]);

  const visibleSessions = useMemo(() => {
    return (resolvedReadySessions?.rows ?? []).filter((row) => (location === "all" ? true : row.location === location));
  }, [location, resolvedReadySessions]);

  useEffect(() => {
    setSelectedSessionIds((current) => current.filter((id) => visibleSessions.some((session) => String(session.id) === id)));
  }, [visibleSessions]);

  useEffect(() => {
    if (hasAutoSelectedSessions.current || visibleSessions.length === 0 || selectedSessionIds.length > 0) {
      return;
    }
    hasAutoSelectedSessions.current = true;
    setSelectedSessionIds(visibleSessions.slice(0, Math.min(2, visibleSessions.length)).map((session) => String(session.id)));
  }, [selectedSessionIds.length, visibleSessions]);

  const driverPool = useQuery(
    api.sessions.getCompareDriverPool,
    selectedSessionIds.length > 0 ? { sessionIds: selectedSessionIds as any } : "skip"
  );

  useEffect(() => {
    const available = new Set((driverPool ?? []).map((driver) => driver.driverCode));
    setSelectedDriverCodes((current) => current.filter((driverCode) => available.has(driverCode)));
  }, [driverPool]);

  useEffect(() => {
    if (hasAutoSelectedDrivers.current || !driverPool || driverPool.length === 0 || selectedDriverCodes.length > 0) {
      return;
    }
    hasAutoSelectedDrivers.current = true;
    setSelectedDriverCodes(driverPool.slice(0, Math.min(3, driverPool.length)).map((driver) => driver.driverCode));
  }, [driverPool, selectedDriverCodes.length]);

  const comparison = useQuery(
    api.sessions.getMultiSessionComparison,
    selectedSessionIds.length > 0 && selectedDriverCodes.length > 0
      ? {
          sessionIds: selectedSessionIds as any,
          driverCodes: selectedDriverCodes,
          maxPoints: 80
        }
      : "skip"
  );

  const selectedSessions = useMemo(() => {
    const order = new Map(visibleSessions.map((session, index) => [String(session.id), index]));
    return visibleSessions
      .filter((session) => selectedSessionIds.includes(String(session.id)))
      .sort((a, b) => (order.get(String(a.id)) ?? 0) - (order.get(String(b.id)) ?? 0));
  }, [selectedSessionIds, visibleSessions]);

  const selectedSessionCount = selectedSessionIds.length;
  const selectedDriverCount = selectedDriverCodes.length;

  const lineStyles = useMemo(() => {
    const byDriver = new Map(selectedDriverCodes.map((driverCode, index) => [driverCode, palette[index % palette.length]]));
    const bySession = new Map(selectedSessionIds.map((sessionId, index) => [sessionId, dashPatterns[index % dashPatterns.length]]));
    return { byDriver, bySession };
  }, [selectedDriverCodes, selectedSessionIds]);

  const chartSeries = useMemo(() => {
    if (!comparison || comparison.series.length === 0) {
      return [] as Array<{ key: string; polyline: string; color: string; dashArray?: string; label: string }>;
    }

    const allTimes = comparison.series.flatMap((series) => series.points.map((point) => point.lapTimeMs));
    const minMs = Math.min(...allTimes);
    const maxMs = Math.max(...allTimes);
    const range = Math.max(maxMs - minMs, 1);

    return comparison.series.map((series) => ({
      key: series.key,
      polyline: series.points
        .map((point) => {
          const x = point.progressRatio * 100;
          const y = 100 - ((point.lapTimeMs - minMs) / range) * 88 - 6;
          return `${x},${y}`;
        })
        .join(" "),
      color: lineStyles.byDriver.get(series.driverCode) ?? palette[0],
      dashArray: lineStyles.bySession.get(series.sessionId) === "none" ? undefined : lineStyles.bySession.get(series.sessionId),
      label: `${displayDriverLabel(series.driverCode, series.driverName)} - ${series.sessionLabel}`
    }));
  }, [comparison, lineStyles]);

  const driverLegend = useMemo(() => {
    if (!comparison) {
      return [] as Array<{ driverCode: string; driverName: string | null; teamName: string | null }>;
    }

    return comparison.aggregates.map((row) => ({
      driverCode: row.driverCode,
      driverName: row.driverName,
      teamName: row.teamName
    }));
  }, [comparison]);

  const sessionLegend = useMemo(() => {
    return selectedSessions.map((session, index) => ({
      id: String(session.id),
      label: `${session.seasonYear ?? "-"} ${session.sessionCode} ${session.eventName}`,
      dashArray: dashPatterns[index % dashPatterns.length]
    }));
  }, [selectedSessions]);

  return (
    <section className="panel" style={{ marginBottom: "1rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "0.75rem", flexWrap: "wrap" }}>
        <div>
          <h2 style={{ margin: 0 }}>Comparison Lab</h2>
          <p style={{ margin: "0.35rem 0 0", color: "#5f7189" }}>
            Compare as many drivers as you want across one session or the same session type at the same track over multiple years.
          </p>
        </div>
        <span className="pill mono">multi-session analysis</span>
      </div>

      <div className="compare-filter-grid" style={{ marginTop: "0.9rem", marginBottom: "1rem" }}>
        <div className="compare-dropdown" ref={seasonMenuRef}>
          <button type="button" className="select compare-dropdown-trigger" onClick={() => setSeasonMenuOpen((open) => !open)}>
            <span>{seasonSummary}</span>
            <span className="mono">{seasonMenuOpen ? "-" : "+"}</span>
          </button>
          {seasonMenuOpen ? (
            <div className="compare-dropdown-menu">
              <button type="button" className="compare-dropdown-action" onClick={() => setSeasonYears([])}>
                Show all seasons
              </button>
              {(resolvedReadySessions?.facets.seasons ?? []).map((year) => {
                const checked = seasonYears.includes(year);
                return (
                  <label key={year} className="compare-checkbox-row">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() =>
                        setSeasonYears((current) =>
                          current.includes(year) ? current.filter((value) => value !== year) : [...current, year].sort((a, b) => b - a)
                        )
                      }
                    />
                    <span>{year}</span>
                  </label>
                );
              })}
            </div>
          ) : null}
        </div>

        <select className="select" value={sessionCode ?? "all"} onChange={(event) => setSessionCode(event.target.value === "all" ? undefined : event.target.value)}>
          <option value="all">All session types</option>
          {(readySessions?.facets.sessionCodes ?? []).map((code) => (
            <option key={code} value={code}>
              {code}
            </option>
          ))}
        </select>

        <select className="select" value={location} onChange={(event) => setLocation(event.target.value)}>
          <option value="all">All tracks</option>
          {locationOptions.map((track) => (
            <option key={track} value={track}>
              {track}
            </option>
          ))}
        </select>

        <div className="select mono compare-summary-chip">sessions: {selectedSessionCount}</div>
        <div className="select mono compare-summary-chip">drivers: {selectedDriverCount}</div>
      </div>
      <p style={{ margin: "-0.45rem 0 1rem", color: "#66778f", fontSize: "0.88rem" }}>
        Seasons: <strong>{seasonSummary}</strong>. Open the season filter to tick one or more years, or leave it empty to show all available seasons.
      </p>

      <div className="compare-builder-grid">
        <article className="panel compare-builder-card">
          <div className="section-heading" style={{ alignItems: "start" }}>
            <div>
              <span className="eyebrow">Step 1</span>
              <h3 style={{ margin: 0 }}>Pick the sessions</h3>
            </div>
            <div style={{ display: "flex", gap: "0.45rem", flexWrap: "wrap" }}>
              <button className="btn" onClick={() => setSelectedSessionIds(visibleSessions.map((session) => String(session.id)))}>
                Select all visible
              </button>
              <button className="btn" onClick={() => setSelectedSessionIds([])}>
                Clear
              </button>
            </div>
          </div>

          <p style={{ color: "#65768f", margin: "0.35rem 0 0.75rem" }}>
            Filter to one track and one session type to build a same-circuit comparison across seasons.
          </p>

          <div className="compare-chip-list">
            {visibleSessions.map((session) => {
              const selected = selectedSessionIds.includes(String(session.id));
              return (
                <button
                  key={String(session.id)}
                  type="button"
                  className={`compare-chip ${selected ? "is-active" : ""}`}
                  onClick={() => setSelectedSessionIds((current) => toggleValue(current, String(session.id)))}
                >
                  <strong>
                    {session.seasonYear ?? "-"} {session.sessionCode}
                  </strong>
                  <span>{session.eventName}</span>
                  <span>{session.location ?? "Track unknown"}</span>
                </button>
              );
            })}
          </div>
        </article>

        <article className="panel compare-builder-card">
          <div className="section-heading" style={{ alignItems: "start" }}>
            <div>
              <span className="eyebrow">Step 2</span>
              <h3 style={{ margin: 0 }}>Pick the drivers</h3>
            </div>
            <div style={{ display: "flex", gap: "0.45rem", flexWrap: "wrap" }}>
              <button className="btn" onClick={() => setSelectedDriverCodes((driverPool ?? []).map((driver) => driver.driverCode))}>
                Select all available
              </button>
              <button className="btn" onClick={() => setSelectedDriverCodes([])}>
                Clear
              </button>
            </div>
          </div>

          <p style={{ color: "#65768f", margin: "0.35rem 0 0.75rem" }}>
            Driver availability updates from the currently selected sessions, so you can compare mixed eras only where data exists.
          </p>

          <div className="compare-chip-list compare-chip-list-compact">
            {(driverPool ?? []).map((driver) => {
              const selected = selectedDriverCodes.includes(driver.driverCode);
              return (
                <button
                  key={driver.driverCode}
                  type="button"
                  className={`compare-chip ${selected ? "is-active" : ""}`}
                  onClick={() => setSelectedDriverCodes((current) => toggleValue(current, driver.driverCode))}
                >
                  <strong>{displayDriverLabel(driver.driverCode, driver.driverName)}</strong>
                  <span>{driver.teamName ?? "Team unknown"}</span>
                  <span>{driver.sessionCount} session(s)</span>
                  <span>{driver.totalLaps} laps</span>
                </button>
              );
            })}
          </div>
        </article>
      </div>

      {!comparison ? (
        <p style={{ margin: "1rem 0 0", color: "#64758a" }}>Choose at least one session and one driver to load the comparison workspace.</p>
      ) : (
        <>
          <section className="grid-3" style={{ margin: "1rem 0 0.8rem" }}>
            <article className="kpi-card">
              <p className="kpi-label">Selected Sessions</p>
              <p className="kpi-value">{comparison.sessions.length}</p>
              <p style={{ margin: "0.25rem 0 0", color: "#65768f" }}>Mix years, but keep track and session type aligned when you want a clean same-circuit study.</p>
            </article>
            <article className="kpi-card">
              <p className="kpi-label">Selected Drivers</p>
              <p className="kpi-value">{comparison.aggregates.length}</p>
              <p style={{ margin: "0.25rem 0 0", color: "#65768f" }}>Every selected driver becomes a color across all chosen sessions.</p>
            </article>
            <article className="kpi-card">
              <p className="kpi-label">Comparable Runs</p>
              <p className="kpi-value">{comparison.summaries.length}</p>
              <p style={{ margin: "0.25rem 0 0", color: "#65768f" }}>Driver-session combinations with actual lap data behind them.</p>
            </article>
          </section>

          <div className="panel" style={{ padding: "0.8rem", marginBottom: "0.8rem" }}>
            <div className="section-heading">
              <div>
                <h3 style={{ margin: 0 }}>Normalized Pace Overlay</h3>
                <p>Color identifies driver. Stroke pattern identifies session, so one driver can be tracked across years at the same circuit.</p>
              </div>
            </div>
            <div className="story-chart">
              <svg viewBox="0 0 100 100" style={{ width: "100%", height: 460 }} aria-label="Multi-session pace overlay">
                <polyline fill="none" stroke="#e7eef9" strokeWidth="0.8" points="0,94 100,94" />
                {chartSeries.map((series) => (
                  <polyline
                    key={series.key}
                    fill="none"
                    stroke={series.color}
                    strokeWidth="2"
                    strokeDasharray={series.dashArray}
                    points={series.polyline}
                  />
                ))}
              </svg>
            </div>

            <div className="compare-legend-block">
              <div className="compare-legend-grid">
                {driverLegend.map((driver) => (
                  <span key={driver.driverCode} className="pill">
                    <span style={{ width: 8, height: 8, borderRadius: 999, background: lineStyles.byDriver.get(driver.driverCode), display: "inline-block" }} />
                    {displayDriverLabel(driver.driverCode, driver.driverName)}
                  </span>
                ))}
              </div>
              <div className="compare-legend-grid">
                {sessionLegend.map((session) => (
                  <span key={session.id} className="pill mono">
                    <span className="compare-dash-swatch" style={{ background: session.dashArray === "none" ? "var(--ink)" : "transparent" }}>
                      <svg viewBox="0 0 24 8" aria-hidden="true">
                        <line x1="0" y1="4" x2="24" y2="4" stroke="currentColor" strokeWidth="2" strokeDasharray={session.dashArray === "none" ? undefined : session.dashArray} />
                      </svg>
                    </span>
                    {session.label}
                  </span>
                ))}
              </div>
            </div>
          </div>

          <div className="session-explorer-grid" style={{ marginBottom: "0.8rem" }}>
            <article className="panel" style={{ padding: "0.8rem" }}>
              <h3 style={{ marginTop: 0 }}>Driver Ranking Across Selection</h3>
              <div className="table-wrap">
                <table className="table table-compact" style={{ minWidth: 620 }}>
                  <thead>
                    <tr>
                      <th>Driver</th>
                      <th>Sessions</th>
                      <th>Total Laps</th>
                      <th>Best Lap</th>
                      <th>Median of Medians</th>
                      <th>Avg Gap to Session Best</th>
                    </tr>
                  </thead>
                  <tbody>
                    {comparison.aggregates.map((row) => (
                      <tr key={row.driverCode}>
                        <td>
                          <strong>{displayDriverLabel(row.driverCode, row.driverName)}</strong>
                          <div style={{ color: "#6b7e81", fontSize: "0.82rem" }}>{row.teamName ?? "Team unknown"}</div>
                        </td>
                        <td>{row.sessionCount}</td>
                        <td>{row.totalLaps}</td>
                        <td className="mono">{formatLapMs(row.bestLapMs)}</td>
                        <td className="mono">{formatLapMs(row.medianOfMediansMs)}</td>
                        <td className="mono" style={{ color: (row.averageDeltaToSessionBestMs ?? 0) <= 0 ? "var(--ok)" : "var(--warn)" }}>
                          {formatDelta(row.averageDeltaToSessionBestMs)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </article>

            <article className="panel" style={{ padding: "0.8rem" }}>
              <h3 style={{ marginTop: 0 }}>Selected Sessions</h3>
              <div className="compare-session-list">
                {selectedSessions.map((session, index) => (
                  <div key={String(session.id)} className="compare-session-card">
                    <strong>
                      {session.seasonYear ?? "-"} R{session.round ?? "-"} {session.sessionCode}
                    </strong>
                    <span>{session.eventName}</span>
                    <span>{session.location ?? "Track unknown"}</span>
                    <span className="mono">style: {dashPatterns[index % dashPatterns.length] === "none" ? "solid" : "dashed"}</span>
                  </div>
                ))}
              </div>
            </article>
          </div>

          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Session</th>
                  <th>Driver</th>
                  <th>Laps</th>
                  <th>Best</th>
                  <th>Median</th>
                  <th>Average</th>
                  <th>Consistency</th>
                  <th>Gap to Session Best</th>
                </tr>
              </thead>
              <tbody>
                {comparison.summaries.map((row) => (
                  <tr key={row.key}>
                    <td>
                      <strong>{row.sessionLabel}</strong>
                      <div style={{ color: "#6b7e81", fontSize: "0.82rem" }}>{row.location ?? "Track unknown"}</div>
                    </td>
                    <td>
                      <strong>{displayDriverLabel(row.driverCode, row.driverName)}</strong>
                      <div style={{ color: "#6b7e81", fontSize: "0.82rem" }}>{row.teamName ?? "Team unknown"}</div>
                    </td>
                    <td>{row.lapCount}</td>
                    <td className="mono">{formatLapMs(row.bestLapMs)}</td>
                    <td className="mono">{formatLapMs(row.medianLapMs)}</td>
                    <td className="mono">{formatLapMs(row.averageLapMs)}</td>
                    <td className="mono">{formatDelta(row.stdDevMs)}</td>
                    <td className="mono" style={{ color: (row.deltaToSessionBestMs ?? 0) <= 0 ? "var(--ok)" : "var(--warn)" }}>
                      {formatDelta(row.deltaToSessionBestMs)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}
