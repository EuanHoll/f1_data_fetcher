"use client";

import { useEffect, useState } from "react";

function utcTime() {
  const now = new Date();
  const hours = String(now.getUTCHours()).padStart(2, "0");
  const minutes = String(now.getUTCMinutes()).padStart(2, "0");
  const seconds = String(now.getUTCSeconds()).padStart(2, "0");
  return `${hours}:${minutes}:${seconds} UTC`;
}

export function SystemHeader({ isAdminView = false }: { isAdminView?: boolean }) {
  const [clock, setClock] = useState("00:00:00 UTC");

  useEffect(() => {
    setClock(utcTime());
    const timer = window.setInterval(() => setClock(utcTime()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <div className={`system-header ${isAdminView ? "warning-bg" : ""}`}>
      <div className="sys-id">SYSTEM.ID // F1_PACE_LAB_V2.0.0{isAdminView ? " [ADMIN_MODE]" : ""}</div>
      <div className="sys-status">
        <span className={`status-indicator ${isAdminView ? "warning" : "online"}`} />
        {isAdminView ? "SYS.ADMIN_OVR" : "SYS.ONLINE"}
      </div>
      <div className="sys-time">{clock}</div>
    </div>
  );
}
