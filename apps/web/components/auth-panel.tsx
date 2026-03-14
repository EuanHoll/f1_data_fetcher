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
      <section className="panel account-panel" style={{ marginBottom: "1rem" }}>
        <div>
          <span className="eyebrow">Account</span>
          <h2>Signed in and ready to save analysis.</h2>
          <p>
            <strong>{data.user?.name ?? "Unknown"}</strong> can save private views now.
            {data.user?.role === "admin" ? " This account also has admin ingestion access." : ""}
          </p>
        </div>
        <button onClick={() => signOut({ redirect: false })} className="btn">
          Sign out
        </button>
      </section>
    );
  }

  return (
    <section className="panel account-panel" style={{ marginBottom: "1rem" }}>
      <div>
        <span className="eyebrow">Account</span>
        <h2>Browse freely, sign in when you want ownership.</h2>
        <p>Accounts unlock saved views, personal workspaces, and admin-only ingestion when the user is allowlisted.</p>
      </div>
      <form onSubmit={onSignIn} style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Enter name"
          className="text-input"
        />
        <button type="submit" disabled={pending} className="btn btn-primary">
          {pending ? "Signing in..." : "Sign in"}
        </button>
      </form>
    </section>
  );
}
