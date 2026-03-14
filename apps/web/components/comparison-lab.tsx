"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";

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

export function ComparisonLab() {
  const [seasonYear, setSeasonYear] = useState<number | undefined>(undefined);
  const [sessionCode, setSessionCode] = useState<string | undefined>(undefined);
  const [sessionId, setSessionId] = useState<string>("");
  const [driverA, setDriverA] = useState<string>("");
  const [driverB, setDriverB] = useState<string>("");

  const readySessions = useQuery(api.sessions.getReadySessionsForCompare, {
    limit: 500,
    seasonYear,
    sessionCode
  });

  const sessions = useMemo(() => {
    return readySessions?.rows ?? [];
  }, [readySessions]);

  useEffect(() => {
    if (!sessionId && sessions.length > 0) {
      setSessionId(String(sessions[0].id));
    }
  }, [sessions, sessionId]);

  const drivers = useQuery(api.sessions.getSessionDrivers, sessionId ? { sessionId: sessionId as any } : "skip");

  useEffect(() => {
    if (!drivers || drivers.length === 0) {
      return;
    }
    if (!driverA) {
      setDriverA(drivers[0].driverCode);
    }
    if (!driverB) {
      setDriverB(drivers[Math.min(1, drivers.length - 1)].driverCode);
    }
  }, [drivers, driverA, driverB]);

  const comparison = useQuery(
    api.sessions.getSessionComparison,
    sessionId && driverA && driverB
      ? {
          sessionId: sessionId as any,
          driverA,
          driverB,
          maxPoints: 160
        }
      : "skip"
  );

  const seasonOptions = readySessions?.facets.seasons ?? [];
  const sessionCodeOptions = readySessions?.facets.sessionCodes ?? [];

  const chartPayload = useMemo(() => {
    if (!comparison) {
      return null;
    }

    const comparable = comparison.points.filter(
      (point) => point.aLapTimeMs !== null && point.bLapTimeMs !== null && point.deltaMs !== null && Math.abs(point.deltaMs) < 8000
    );

    if (comparable.length < 2) {
      return {
        paceA: "",
        paceB: "",
        deltaBars: [] as Array<{ x: number; y: number; width: number; height: number; color: string }>
      };
    }

    const allPace = comparable.flatMap((point) => [point.aLapTimeMs as number, point.bLapTimeMs as number]);
    const minPace = Math.min(...allPace);
    const maxPace = Math.max(...allPace);
    const paceRange = Math.max(maxPace - minPace, 1);

    const pointToXY = (value: number, index: number, total: number) => {
      const x = total === 1 ? 50 : (index / (total - 1)) * 100;
      const y = 100 - ((value - minPace) / paceRange) * 88 - 6;
      return `${x},${y}`;
    };

    const paceA = comparable
      .map((point, index) => pointToXY(point.aLapTimeMs as number, index, comparable.length))
      .join(" ");
    const paceB = comparable
      .map((point, index) => pointToXY(point.bLapTimeMs as number, index, comparable.length))
      .join(" ");

    const maxAbsDelta = Math.max(...comparable.map((point) => Math.abs(point.deltaMs as number)), 1);
    const deltaBars = comparable.map((point, index) => {
      const x = (index / comparable.length) * 100 + 0.3;
      const width = 100 / comparable.length - 0.6;
      const delta = point.deltaMs as number;
      const normalized = (Math.abs(delta) / maxAbsDelta) * 44;
      const y = delta <= 0 ? 50 - normalized : 50;
      return {
        x,
        y,
        width: Math.max(width, 0.15),
        height: Math.max(normalized, 0.8),
        color: delta <= 0 ? "#15803d" : "#b45309"
      };
    });

    return {
      paceA,
      paceB,
      deltaBars
    };
  }, [comparison]);

  return (
    <section className="panel" style={{ marginBottom: "1rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "0.75rem", flexWrap: "wrap" }}>
        <div>
          <h2 style={{ margin: 0 }}>Comparison Lab</h2>
          <p style={{ margin: "0.35rem 0 0", color: "#5f7189" }}>Compare two drivers lap-by-lap and inspect pace deltas.</p>
        </div>
        <span className="pill mono">investigation mode</span>
      </div>

      <div className="select-row" style={{ marginTop: "0.8rem", marginBottom: "0.8rem" }}>
        <select className="select" value={seasonYear ?? "all"} onChange={(event) => setSeasonYear(event.target.value === "all" ? undefined : Number(event.target.value))}>
          <option value="all">All seasons</option>
          {seasonOptions.map((year) => (
            <option key={year} value={year}>
              {year}
            </option>
          ))}
        </select>

        <select className="select" value={sessionCode ?? "all"} onChange={(event) => setSessionCode(event.target.value === "all" ? undefined : event.target.value)}>
          <option value="all">All session types</option>
          {sessionCodeOptions.map((code) => (
            <option key={code} value={code}>
              {code}
            </option>
          ))}
        </select>

        <select className="select" value={sessionId} onChange={(event) => setSessionId(event.target.value)}>
          <option value="">Select session with laps</option>
          {sessions.map((row) => (
            <option key={row.id ?? `${row.eventName}-${row.sessionCode}`} value={String(row.id)}>
              {row.seasonYear} R{row.round} {row.sessionCode} - {row.eventName}
            </option>
          ))}
        </select>

        <select className="select" value={driverA} onChange={(event) => setDriverA(event.target.value)}>
          <option value="">Select Driver A</option>
          {(drivers ?? []).map((driver) => (
            <option key={driver.driverCode} value={driver.driverCode}>
              {driver.driverCode} ({driver.lapCount} laps)
            </option>
          ))}
        </select>

        <select className="select" value={driverB} onChange={(event) => setDriverB(event.target.value)}>
          <option value="">Select Driver B</option>
          {(drivers ?? []).map((driver) => (
            <option key={driver.driverCode} value={driver.driverCode}>
              {driver.driverCode} ({driver.lapCount} laps)
            </option>
          ))}
        </select>
      </div>

      <p style={{ margin: "0 0 0.75rem", color: "#61748f" }}>
        Ready sessions with lap data available: <strong>{readySessions?.totalReadyWithLaps ?? 0}</strong>
      </p>

      {sessions.length === 0 ? (
        <div style={{ border: "1px solid var(--line)", borderRadius: 10, padding: "0.65rem 0.75rem", marginBottom: "0.8rem", background: "#fffdf7" }}>
          <p style={{ margin: 0, color: "#6d5a2d" }}>
            No ready sessions with laps for these filters yet. Clear filters or continue backfill ingest for this season.
          </p>
          <button
            className="btn"
            style={{ marginTop: "0.45rem" }}
            onClick={() => {
              setSeasonYear(undefined);
              setSessionCode(undefined);
            }}
          >
            Clear compare filters
          </button>
        </div>
      ) : null}

      {!comparison ? (
        <p style={{ margin: 0, color: "#64758a" }}>Select a ready session and two drivers to load comparison analytics.</p>
      ) : (
        <>
          <section className="grid-3" style={{ marginBottom: "0.8rem" }}>
            <article className="kpi-card">
              <p className="kpi-label">Median Delta</p>
              <p className="kpi-value">{formatDelta(comparison.stats.medianDeltaMs)}</p>
              <p style={{ margin: "0.25rem 0 0", color: "#65768f" }}>{comparison.driverA} - {comparison.driverB}</p>
            </article>
            <article className="kpi-card">
              <p className="kpi-label">Best Laps</p>
              <p className="kpi-value" style={{ fontSize: "1.2rem" }}>{comparison.driverA}: {formatLapMs(comparison.stats.aBestMs)}</p>
              <p className="kpi-value" style={{ fontSize: "1.2rem", marginTop: "0.1rem" }}>{comparison.driverB}: {formatLapMs(comparison.stats.bBestMs)}</p>
            </article>
            <article className="kpi-card">
              <p className="kpi-label">Consistency (Std Dev)</p>
              <p className="kpi-value" style={{ fontSize: "1.2rem" }}>{comparison.driverA}: {formatDelta(comparison.stats.aStdDevMs)}</p>
              <p className="kpi-value" style={{ fontSize: "1.2rem", marginTop: "0.1rem" }}>{comparison.driverB}: {formatDelta(comparison.stats.bStdDevMs)}</p>
            </article>
          </section>

          <div className="panel" style={{ padding: "0.8rem", marginBottom: "0.8rem" }}>
            <h3 style={{ marginTop: 0 }}>Lap Pace Overlay</h3>
            <div style={{ height: 280 }}>
              <svg viewBox="0 0 100 100" style={{ width: "100%", height: "100%" }} aria-label="Lap pace overlay">
                <polyline fill="none" stroke="#e7eef9" strokeWidth="0.8" points="0,94 100,94" />
                {chartPayload?.paceA ? <polyline fill="none" stroke="#0057ff" strokeWidth="2.2" points={chartPayload.paceA} /> : null}
                {chartPayload?.paceB ? <polyline fill="none" stroke="#ff6b00" strokeWidth="2.2" points={chartPayload.paceB} /> : null}
              </svg>
            </div>
            <div style={{ display: "flex", gap: "0.45rem", flexWrap: "wrap", marginTop: "0.4rem" }}>
              <span className="pill mono"><span style={{ width: 8, height: 8, borderRadius: 999, background: "#0057ff", display: "inline-block" }} /> {comparison.driverA}</span>
              <span className="pill mono"><span style={{ width: 8, height: 8, borderRadius: 999, background: "#ff6b00", display: "inline-block" }} /> {comparison.driverB}</span>
            </div>
          </div>

          <div className="panel" style={{ padding: "0.8rem", marginBottom: "0.8rem" }}>
            <h3 style={{ marginTop: 0 }}>Delta by Lap</h3>
            <div style={{ height: 220 }}>
              <svg viewBox="0 0 100 100" style={{ width: "100%", height: "100%" }} aria-label="Delta bars">
                <polyline fill="none" stroke="#e6ecf5" strokeWidth="0.8" points="0,50 100,50" />
                {(chartPayload?.deltaBars ?? []).map((bar, index) => (
                  <rect key={`${index}-${bar.x}`} x={bar.x} y={bar.y} width={bar.width} height={bar.height} fill={bar.color} opacity="0.88" />
                ))}
              </svg>
            </div>
            <p style={{ margin: "0.3rem 0 0", color: "#63758e", fontSize: "0.86rem" }}>
              Green bars mean {comparison.driverA} is faster on that lap. Orange means {comparison.driverB} is faster.
            </p>
          </div>

          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Lap</th>
                  <th>{comparison.driverA}</th>
                  <th>{comparison.driverB}</th>
                  <th>Delta</th>
                  <th>Compounds</th>
                </tr>
              </thead>
              <tbody>
                {comparison.points.slice(0, 40).map((point) => (
                  <tr key={`${point.lapNumber}-${point.aLapTimeMs}-${point.bLapTimeMs}`}>
                    <td>{point.lapNumber}</td>
                    <td className="mono">{formatLapMs(point.aLapTimeMs)}</td>
                    <td className="mono">{formatLapMs(point.bLapTimeMs)}</td>
                    <td className="mono" style={{ color: (point.deltaMs ?? 0) <= 0 ? "var(--ok)" : "var(--warn)" }}>
                      {formatDelta(point.deltaMs)}
                    </td>
                    <td>{point.aCompound ?? "-"} / {point.bCompound ?? "-"}</td>
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
