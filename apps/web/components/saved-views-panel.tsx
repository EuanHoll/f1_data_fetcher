"use client";

import { FormEvent, useEffect, useState } from "react";
import { useSession } from "next-auth/react";

type SavedView = {
  _id: string;
  title: string;
  description?: string;
  isPublic: boolean;
  updatedAt: number;
};

export function SavedViewsPanel() {
  const { status } = useSession();
  const [items, setItems] = useState<SavedView[]>([]);
  const [loading, setLoading] = useState(false);
  const [title, setTitle] = useState("My first analysis view");
  const [message, setMessage] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setMessage(null);
    const response = await fetch("/api/saved-views", { cache: "no-store" });
    const json = await response.json();
    setItems(json.items ?? []);
    setLoading(false);
  }

  useEffect(() => {
    void load();
  }, [status]);

  async function onCreate(event: FormEvent) {
    event.preventDefault();
    setMessage(null);

    const response = await fetch("/api/saved-views", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: title.trim() || "Untitled view" })
    });

    const json = await response.json();
    if (!response.ok) {
      setMessage(json.error ?? "Failed to create saved view.");
      return;
    }

    setMessage("Saved view created.");
    await load();
  }

  return (
    <section className="panel" style={{ marginBottom: "1rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "0.75rem", flexWrap: "wrap" }}>
        <h2 style={{ margin: 0 }}>Saved Views</h2>
        <button
          onClick={() => void load()}
          style={{ border: "1px solid var(--line)", background: "white", borderRadius: 10, padding: "0.4rem 0.7rem", cursor: "pointer" }}
        >
          Refresh
        </button>
      </div>

      {status !== "authenticated" ? (
        <p style={{ color: "#55676a" }}>Browsing is open to everyone. Sign in to create and store personal saved views.</p>
      ) : (
        <form onSubmit={onCreate} style={{ display: "flex", gap: "0.5rem", marginTop: "0.6rem", flexWrap: "wrap" }}>
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            style={{ border: "1px solid var(--line)", borderRadius: 10, padding: "0.5rem 0.6rem", minWidth: 240 }}
          />
          <button type="submit" style={{ border: "none", background: "var(--accent)", color: "white", borderRadius: 10, padding: "0.5rem 0.7rem", cursor: "pointer" }}>
            Create Saved View
          </button>
        </form>
      )}

      {message ? <p style={{ marginBottom: 0, color: "#5a6a6d" }}>{message}</p> : null}
      {loading ? <p style={{ marginBottom: 0, color: "#5a6a6d" }}>Loading saved views...</p> : null}

      {!loading && items.length === 0 ? <p style={{ marginBottom: 0, color: "#5a6a6d" }}>No saved views yet.</p> : null}

      {items.length > 0 ? (
        <ul style={{ listStyle: "none", margin: "0.75rem 0 0", padding: 0, display: "grid", gap: "0.45rem" }}>
          {items.map((item) => (
            <li key={item._id} style={{ border: "1px solid var(--line)", borderRadius: 10, padding: "0.55rem 0.7rem", display: "flex", justifyContent: "space-between", gap: "0.8rem", flexWrap: "wrap" }}>
              <div>
                <strong>{item.title}</strong>
                {item.description ? <div style={{ color: "#5f7074", fontSize: "0.9rem" }}>{item.description}</div> : null}
              </div>
              <div style={{ display: "flex", gap: "0.45rem", alignItems: "center" }}>
                <span className="pill">{item.isPublic ? "public" : "private"}</span>
                <span style={{ color: "#6d7f83", fontSize: "0.84rem" }}>{new Date(item.updatedAt).toLocaleString()}</span>
              </div>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
