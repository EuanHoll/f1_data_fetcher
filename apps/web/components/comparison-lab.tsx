"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";

const palette = ["#1d4ed8", "#c2410c", "#0f766e", "#7c3aed", "#be123c", "#4d7c0f", "#0369a1", "#b45309"];
const dashPatterns = ["none", "10 6", "3 5", "14 5 3 5", "2 4", "16 6"];
const teamByDriverCode: Record<string, string> = {
  ALB: "Williams",
  ALO: "Aston Martin",
  ANT: "Mercedes",
  BEA: "Haas",
  BOT: "Kick Sauber",
  COL: "Alpine",
  GAS: "Alpine",
  HAD: "RB",
  HAM: "Ferrari",
  HUL: "Kick Sauber",
  LAW: "RB",
  LEC: "Ferrari",
  NOR: "McLaren",
  OCO: "Haas",
  PIA: "McLaren",
  RUS: "Mercedes",
  SAI: "Williams",
  STR: "Aston Martin",
  TSU: "Red Bull",
  VER: "Red Bull"
};

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

function resolveTeamName(driverCode: string, teamName?: string | null) {
  return teamName ?? teamByDriverCode[driverCode] ?? "Team data pending";
}

export function ComparisonLab() {
  const [seasonYears, setSeasonYears] = useState<number[]>([]);
  const [sessionCode, setSessionCode] = useState<string | undefined>(undefined);
  const [location, setLocation] = useState<string>("all");
  const [seasonMenuOpen, setSeasonMenuOpen] = useState(false);
  const [locationMenuOpen, setLocationMenuOpen] = useState(false);
  const [locationSearch, setLocationSearch] = useState("");
  const [sessionSearch, setSessionSearch] = useState("");
  const [showAllSessions, setShowAllSessions] = useState(false);
  const [chartMode, setChartMode] = useState<"absolute" | "delta">("absolute");
  const [selectedSessionIds, setSelectedSessionIds] = useState<string[]>([]);
  const [selectedDriverCodes, setSelectedDriverCodes] = useState<string[]>([]);
  const [hiddenSeriesKeys, setHiddenSeriesKeys] = useState<string[]>([]);
  const [hoveredSeriesKey, setHoveredSeriesKey] = useState<string | null>(null);
  const hasAutoSelectedSessions = useRef(false);
  const hasAutoSelectedDrivers = useRef(false);
  const seasonMenuRef = useRef<HTMLDivElement | null>(null);
  const locationMenuRef = useRef<HTMLDivElement | null>(null);
  const driverListRef = useRef<HTMLDivElement | null>(null);
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
      if (!locationMenuRef.current?.contains(event.target as Node)) {
        setLocationMenuOpen(false);
      }
    }

    if (seasonMenuOpen || locationMenuOpen) {
      window.addEventListener("mousedown", onPointerDown);
    }

    return () => window.removeEventListener("mousedown", onPointerDown);
  }, [locationMenuOpen, seasonMenuOpen]);

  const locationOptions = useMemo(() => {
    return Array.from(new Set((resolvedReadySessions?.rows ?? []).map((row) => row.location).filter((value): value is string => Boolean(value)))).sort();
  }, [resolvedReadySessions]);

  const filteredLocationOptions = useMemo(() => {
    const needle = locationSearch.trim().toLowerCase();
    if (!needle) {
      return locationOptions;
    }
    return locationOptions.filter((track) => track.toLowerCase().includes(needle));
  }, [locationOptions, locationSearch]);

  const locationSummary = location === "all" ? "All tracks" : location;

  const visibleSessions = useMemo(() => {
    return (resolvedReadySessions?.rows ?? []).filter((row) => (location === "all" ? true : row.location === location));
  }, [location, resolvedReadySessions]);

  const filteredSessions = useMemo(() => {
    const needle = sessionSearch.trim().toLowerCase();
    if (!needle) {
      return visibleSessions;
    }

    return visibleSessions.filter((session) => {
      const haystack = [session.eventName, session.location, session.sessionCode, session.sessionName, String(session.seasonYear ?? "")]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(needle);
    });
  }, [sessionSearch, visibleSessions]);

  const displayedSessions = useMemo(() => {
    return showAllSessions ? filteredSessions : filteredSessions.slice(0, 18);
  }, [filteredSessions, showAllSessions]);

  useEffect(() => {
    setSelectedSessionIds((current) => current.filter((id) => visibleSessions.some((session) => String(session.id) === id)));
  }, [visibleSessions]);

  useEffect(() => {
    setShowAllSessions(false);
  }, [location, seasonYears, sessionCode, sessionSearch]);

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

  useEffect(() => {
    if (driverListRef.current) {
      driverListRef.current.scrollTop = 0;
    }
  }, [driverPool, selectedSessionIds]);

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
    const order = new Map(filteredSessions.map((session, index) => [String(session.id), index]));
    return filteredSessions
      .filter((session) => selectedSessionIds.includes(String(session.id)))
      .sort((a, b) => (order.get(String(a.id)) ?? 0) - (order.get(String(b.id)) ?? 0));
  }, [filteredSessions, selectedSessionIds]);

  const selectedSessionCount = selectedSessionIds.length;
  const selectedDriverCount = selectedDriverCodes.length;
  const useSessionColors = selectedDriverCodes.length === 1;

  const lineStyles = useMemo(() => {
    const byDriver = new Map(selectedDriverCodes.map((driverCode, index) => [driverCode, palette[index % palette.length]]));
    const bySession = new Map(selectedSessionIds.map((sessionId, index) => [sessionId, dashPatterns[index % dashPatterns.length]]));
    const bySessionColor = new Map(selectedSessionIds.map((sessionId, index) => [sessionId, palette[index % palette.length]]));
    return { byDriver, bySession, bySessionColor };
  }, [selectedDriverCodes, selectedSessionIds]);

  useEffect(() => {
    const availableKeys = new Set((comparison?.series ?? []).map((series) => series.key));
    setHiddenSeriesKeys((current) => current.filter((key) => availableKeys.has(key)));
    setHoveredSeriesKey((current) => (current && availableKeys.has(current) ? current : null));
  }, [comparison]);

  const chartModel = useMemo(() => {
    if (!comparison || comparison.series.length === 0) {
      return null;
    }

    const allPlottedSeries = comparison.series.map((series) => ({
      ...series,
      plottedPoints: series.points.map((point) => ({
        ...point,
        plottedValue: chartMode === "delta" && series.sessionBestLapMs !== null ? point.lapTimeMs - series.sessionBestLapMs : point.lapTimeMs
      }))
    }));

    const allValues = allPlottedSeries.flatMap((series) => series.plottedPoints.map((point) => point.plottedValue));
    const maxPointsPerSeries = Math.max(...allPlottedSeries.map((series) => series.points.length), 1);
    const minMs = Math.min(...allValues);
    const maxMs = Math.max(...allValues);
    const range = Math.max(maxMs - minMs, 1);

    const visibleSeries = comparison.series.filter((series) => !hiddenSeriesKeys.includes(series.key));
    if (visibleSeries.length === 0) {
      return {
        empty: true as const,
        totalSeries: comparison.series.length,
        chartMode
      };
    }

    const plottedSeries = visibleSeries.map((series) => ({
      ...series,
      plottedPoints: series.points.map((point) => ({
        ...point,
        plottedValue: chartMode === "delta" && series.sessionBestLapMs !== null ? point.lapTimeMs - series.sessionBestLapMs : point.lapTimeMs
      }))
    }));
    const chartWidth = Math.max(720, Math.min(1440, 360 + maxPointsPerSeries * 14));
    const chartHeight = 520;
    const paddingLeft = 92;
    const paddingRight = 30;
    const paddingTop = 28;
    const paddingBottom = 56;
    const innerWidth = chartWidth - paddingLeft - paddingRight;
    const innerHeight = chartHeight - paddingTop - paddingBottom;
    const yTicks = Array.from({ length: 5 }, (_, index) => {
      const ratio = index / 4;
      const value = maxMs - range * ratio;
      const y = paddingTop + innerHeight * ratio;
      return {
        y,
        value: Math.round(value)
      };
    });
    const xTicks = [0, 0.25, 0.5, 0.75, 1].map((ratio) => ({
      x: paddingLeft + innerWidth * ratio,
      label: ratio === 0 ? "Start" : ratio === 1 ? "Finish" : `${Math.round(ratio * 100)}%`
    }));

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
      minMs,
      maxMs,
      empty: false as const,
      chartMode,
      series: plottedSeries.map((series) => {
        const points = series.plottedPoints.map((point) => {
          const x = paddingLeft + innerWidth * point.progressRatio;
          const y = paddingTop + ((maxMs - point.plottedValue) / range) * innerHeight;
          return { x, y, lapTimeMs: point.lapTimeMs, plottedValue: point.plottedValue, lapNumber: point.lapNumber };
        });

        const strokeColor = useSessionColors
          ? lineStyles.bySessionColor.get(series.sessionId) ?? palette[0]
          : lineStyles.byDriver.get(series.driverCode) ?? palette[0];

        return {
          key: series.key,
          sessionId: series.sessionId,
          driverCode: series.driverCode,
          points,
          polyline: points.map((point) => `${point.x},${point.y}`).join(" "),
          color: strokeColor,
          dashArray: lineStyles.bySession.get(series.sessionId) === "none" ? undefined : lineStyles.bySession.get(series.sessionId),
          label: `${displayDriverLabel(series.driverCode, series.driverName)} - ${series.sessionLabel}`,
          endPoint: points[points.length - 1],
          startPoint: points[0]
        };
      })
    };
  }, [chartMode, comparison, hiddenSeriesKeys, lineStyles, useSessionColors]);

  const chartSeriesLegend = useMemo(() => {
    return (comparison?.series ?? []).map((series) => ({
      key: series.key,
      driverCode: series.driverCode,
      driverName: series.driverName,
      sessionLabel: series.sessionLabel,
      sessionId: series.sessionId,
      hidden: hiddenSeriesKeys.includes(series.key),
      color: useSessionColors ? lineStyles.bySessionColor.get(series.sessionId) ?? palette[0] : lineStyles.byDriver.get(series.driverCode) ?? palette[0],
      dashArray: lineStyles.bySession.get(series.sessionId) === "none" ? undefined : lineStyles.bySession.get(series.sessionId)
    }));
  }, [comparison, hiddenSeriesKeys, lineStyles, useSessionColors]);

  return (
    <section className="panel compare-workspace" style={{ marginBottom: "1rem" }}>
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

        <div className="compare-dropdown" ref={locationMenuRef}>
          <button type="button" className="select compare-dropdown-trigger" onClick={() => setLocationMenuOpen((open) => !open)}>
            <span>{locationSummary}</span>
            <span className="mono">{locationMenuOpen ? "-" : "+"}</span>
          </button>
          {locationMenuOpen ? (
            <div className="compare-dropdown-menu compare-dropdown-menu-wide">
              <input
                value={locationSearch}
                onChange={(event) => setLocationSearch(event.target.value)}
                className="tech-input compare-filter-search"
                placeholder="Search track"
              />
              <button
                type="button"
                className="compare-dropdown-action"
                onClick={() => {
                  setLocation("all");
                  setLocationMenuOpen(false);
                }}
              >
                Show all tracks
              </button>
              {filteredLocationOptions.map((track) => (
                <button
                  key={track}
                  type="button"
                  className={`compare-dropdown-action ${location === track ? "is-active" : ""}`}
                  onClick={() => {
                    setLocation(track);
                    setLocationMenuOpen(false);
                  }}
                >
                  {track}
                </button>
              ))}
              {filteredLocationOptions.length === 0 ? <div className="compare-dropdown-empty">No matching tracks.</div> : null}
            </div>
          ) : null}
        </div>

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

          <div className="compare-session-toolbar">
            <input
              value={sessionSearch}
              onChange={(event) => setSessionSearch(event.target.value)}
              className="tech-input"
              placeholder="Search year, event, track, or session code"
            />
            <div className="compare-session-meta mono">
              showing {displayedSessions.length} of {filteredSessions.length}
            </div>
          </div>

          <div className={`compare-selected-strip ${selectedSessions.length === 0 ? "is-empty" : ""}`}>
            {selectedSessions.length > 0 ? (
              selectedSessions.map((session) => (
                <button
                  key={`selected-${String(session.id)}`}
                  type="button"
                  className="compare-selected-pill"
                  onClick={() => setSelectedSessionIds((current) => current.filter((id) => id !== String(session.id)))}
                >
                  <strong>
                    {session.seasonYear ?? "-"} {session.sessionCode}
                  </strong>
                  <span>{session.eventName}</span>
                </button>
              ))
            ) : (
              <div className="compare-selected-placeholder mono">No sessions selected yet. Tick one or more rows to build the overlay.</div>
            )}
          </div>

          <div className="compare-session-table-shell">
            <div className="table-wrap">
              <table className="table table-compact compare-session-table" style={{ minWidth: 680 }}>
                <thead>
                  <tr>
                    <th>Select</th>
                    <th>Season</th>
                    <th>Session</th>
                    <th>Event</th>
                    <th>Track</th>
                  </tr>
                </thead>
                <tbody>
                  {displayedSessions.map((session) => {
                    const selected = selectedSessionIds.includes(String(session.id));
                    return (
                      <tr key={String(session.id)} className={selected ? "is-selected" : ""}>
                        <td>
                          <input
                            type="checkbox"
                            checked={selected}
                            onChange={() => setSelectedSessionIds((current) => toggleValue(current, String(session.id)))}
                          />
                        </td>
                        <td>{session.seasonYear ?? "-"}</td>
                        <td>
                          <strong>{session.sessionCode}</strong>
                          <div style={{ color: "#6b7e81", fontSize: "0.82rem" }}>{session.sessionName}</div>
                        </td>
                        <td>{session.eventName}</td>
                        <td>{session.location ?? "Track unknown"}</td>
                      </tr>
                    );
                  })}
                  {displayedSessions.length === 0 ? (
                    <tr>
                      <td colSpan={5} style={{ color: "#6b7e94" }}>
                        No sessions match the current filters.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>

          <div className="compare-session-footer">
            <span className="mono compare-session-meta">
              {filteredSessions.length > 18
                ? showAllSessions
                  ? `Showing all ${filteredSessions.length} matching sessions`
                  : `Large result set detected - previewing first 18 sessions`
                : `Showing all ${filteredSessions.length} matching sessions`}
            </span>
            {filteredSessions.length > 18 ? (
              <button className="btn" onClick={() => setShowAllSessions((current) => !current)}>
                {showAllSessions ? "Show fewer" : "Show all"}
              </button>
            ) : (
              <span className="compare-session-footer-spacer" aria-hidden="true" />
            )}
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

          <div ref={driverListRef} className="compare-chip-list compare-chip-list-compact">
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
                    <span>{resolveTeamName(driver.driverCode, driver.teamName)}</span>
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
                <p>Color identifies driver. Stroke pattern identifies session. Use the visibility controls to focus the chart instead of loading it again.</p>
              </div>
              <div style={{ display: "flex", gap: "0.45rem", flexWrap: "wrap" }}>
                <button className={`btn ${chartMode === "absolute" ? "btn-primary" : ""}`} onClick={() => setChartMode("absolute")}>
                  Absolute lap time
                </button>
                <button className={`btn ${chartMode === "delta" ? "btn-primary" : ""}`} onClick={() => setChartMode("delta")}>
                  Delta to session best
                </button>
                <button className="btn" onClick={() => setHiddenSeriesKeys([])}>
                  Show all lines
                </button>
              </div>
            </div>
            <div className="story-chart compare-chart-shell">
              <div className="compare-chart-scroll">
                {chartModel && !chartModel.empty ? (
                  <svg
                    viewBox={`0 0 ${chartModel.chartWidth} ${chartModel.chartHeight}`}
                    style={{ width: chartModel.chartWidth, height: chartModel.chartHeight }}
                    aria-label="Multi-session pace overlay"
                  >
                    {chartModel.yTicks.map((tick) => (
                      <g key={`y-${tick.y}`}>
                        <line
                          x1={chartModel.paddingLeft}
                          y1={tick.y}
                          x2={chartModel.chartWidth - chartModel.paddingRight}
                          y2={tick.y}
                          stroke="#e4ebf5"
                          strokeWidth="1"
                        />
                        <text x={chartModel.paddingLeft - 12} y={tick.y + 4} textAnchor="end" fontSize="12" fill="#73839a">
                          {chartModel.chartMode === "delta" ? formatDelta(tick.value) : formatLapMs(tick.value)}
                        </text>
                      </g>
                    ))}
                    {chartModel.xTicks.map((tick) => (
                      <g key={`x-${tick.label}`}>
                        <line
                          x1={tick.x}
                          y1={chartModel.paddingTop}
                          x2={tick.x}
                          y2={chartModel.chartHeight - chartModel.paddingBottom}
                          stroke="#eef3fa"
                          strokeWidth="1"
                        />
                        <text x={tick.x} y={chartModel.chartHeight - 18} textAnchor="middle" fontSize="12" fill="#73839a">
                          {tick.label}
                        </text>
                      </g>
                    ))}
                    <rect
                      x={chartModel.paddingLeft}
                      y={chartModel.paddingTop}
                      width={chartModel.innerWidth}
                      height={chartModel.innerHeight}
                      fill="transparent"
                      stroke="#dfe8f4"
                      strokeWidth="1"
                      rx="18"
                    />
                    {chartModel.series.map((series) => (
                      <g key={series.key} onMouseEnter={() => setHoveredSeriesKey(series.key)} onMouseLeave={() => setHoveredSeriesKey((current) => (current === series.key ? null : current))}>
                        <polyline
                          fill="none"
                          stroke={series.color}
                          strokeWidth={hoveredSeriesKey === null || hoveredSeriesKey === series.key ? 4.5 : 2.2}
                          opacity={hoveredSeriesKey === null || hoveredSeriesKey === series.key ? 1 : 0.18}
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeDasharray={series.dashArray}
                          points={series.polyline}
                        />
                        {series.startPoint ? <circle cx={series.startPoint.x} cy={series.startPoint.y} r="4" fill={series.color} opacity={hoveredSeriesKey === null || hoveredSeriesKey === series.key ? 1 : 0.18} /> : null}
                        {series.endPoint ? <circle cx={series.endPoint.x} cy={series.endPoint.y} r="4.5" fill={series.color} opacity={hoveredSeriesKey === null || hoveredSeriesKey === series.key ? 1 : 0.18} /> : null}
                      </g>
                    ))}
                  </svg>
                ) : chartModel?.empty ? (
                  <div className="compare-chart-empty">All loaded lines are hidden. Re-enable one below or click `Show all lines`.</div>
                ) : null}
              </div>
              <p className="compare-chart-caption">
                Scroll horizontally for longer runs. Hover a line to isolate it visually, or switch to delta mode to compare each run against that session&apos;s fastest lap.
              </p>
            </div>

            <div className="compare-series-controls">
              {chartSeriesLegend.map((series) => (
                <button
                  key={series.key}
                  type="button"
                  className={`compare-series-chip ${series.hidden ? "is-muted" : ""} ${hoveredSeriesKey === series.key ? "is-focused" : ""}`}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() =>
                    setHiddenSeriesKeys((current) =>
                      current.includes(series.key) ? current.filter((key) => key !== series.key) : [...current, series.key]
                    )
                  }
                  onMouseEnter={() => setHoveredSeriesKey(series.key)}
                  onMouseLeave={() => setHoveredSeriesKey((current) => (current === series.key ? null : current))}
                >
                  <span className="compare-series-visibility" aria-hidden="true">
                    {series.hidden ? "○" : "●"}
                  </span>
                  <span className="compare-series-swatch">
                    <svg viewBox="0 0 44 10" preserveAspectRatio="none" aria-hidden="true">
                      <line x1="0" y1="5" x2="44" y2="5" stroke={series.color} strokeWidth="3" strokeDasharray={series.dashArray} strokeLinecap="round" />
                    </svg>
                  </span>
                  <span className="compare-series-name">{displayDriverLabel(series.driverCode, series.driverName)}</span>
                  <span className="compare-series-race mono">{series.sessionLabel}</span>
                </button>
              ))}
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
                          <div style={{ color: "#6b7e81", fontSize: "0.82rem" }}>{resolveTeamName(row.driverCode, row.teamName)}</div>
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
                      <div style={{ color: "#6b7e81", fontSize: "0.82rem" }}>{resolveTeamName(row.driverCode, row.teamName)}</div>
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
