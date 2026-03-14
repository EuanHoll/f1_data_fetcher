"use client";

import { FormEvent, useState } from "react";
import { signIn, signOut, useSession } from "next-auth/react";

export function AuthPanel() {
  const { data, status } = useSession();
  const [name, setName] = useState("");
  const [pending, setPending] = useState(false);

  async function onSignIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!name.trim()) {
      return;
    }

    setPending(true);
    await signIn("credentials", {
      name: name.trim(),
      redirect: false
    });
    setPending(false);
  }

  if (status === "authenticated") {
    return (
      <section className="panel" style={{ marginBottom: "1rem" }}>
        <h2 style={{ marginTop: 0 }}>Auth</h2>
        <p style={{ marginTop: 0, color: "#46575a" }}>
          Signed in as <strong>{data.user?.name ?? "Unknown"}</strong> ({data.user?.email ?? "No email"})
        </p>
        <button
          onClick={() => signOut({ redirect: false })}
          style={{ border: "1px solid var(--line)", background: "white", borderRadius: 10, padding: "0.45rem 0.7rem", cursor: "pointer" }}
        >
          Sign out
        </button>
      </section>
    );
  }

  return (
    <section className="panel" style={{ marginBottom: "1rem" }}>
      <h2 style={{ marginTop: 0 }}>Auth</h2>
      <p style={{ marginTop: 0, color: "#46575a" }}>
        Anyone can browse the site. Sign in only if you want saved views and account-specific features.
      </p>
      <p style={{ marginTop: "-0.35rem", color: "#66797d", fontSize: "0.92rem" }}>
        For production, add OAuth providers (for example GitHub) via environment variables.
      </p>
      <form onSubmit={onSignIn} style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Enter name"
          style={{ border: "1px solid var(--line)", borderRadius: 10, padding: "0.5rem 0.6rem", minWidth: 220 }}
        />
        <button
          type="submit"
          disabled={pending}
          style={{ border: "none", background: "var(--accent)", color: "white", borderRadius: 10, padding: "0.5rem 0.7rem", cursor: "pointer" }}
        >
          {pending ? "Signing in..." : "Sign in"}
        </button>
      </form>
    </section>
  );
}
