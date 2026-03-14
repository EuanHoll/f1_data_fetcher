"use client";

import { FormEvent, useState } from "react";
import { signIn, useSession } from "next-auth/react";

export function AdminAccessCard() {
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

  return (
    <section className="panel admin-lockup">
      <span className="eyebrow">Admin Access</span>
      <h1>Ingestion controls stay in the product, but behind the right door.</h1>
      <p>
        The public app is open for analysis. Session ingestion, queue management, and operational controls are reserved for authenticated admins.
      </p>

      {status === "authenticated" ? (
        <div className="admin-access-note">
          <strong>{data.user?.name ?? "Signed in"}</strong>
          <span>
            This account is not currently mapped to an admin role. Add its email to `ADMIN_EMAILS` or its subject to `ADMIN_AUTH_SUBJECTS` to unlock this page.
          </span>
        </div>
      ) : (
        <form onSubmit={onSignIn} className="admin-access-form">
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Enter admin name"
            className="text-input"
          />
          <button type="submit" disabled={pending} className="btn btn-primary">
            {pending ? "Signing in..." : "Sign in"}
          </button>
        </form>
      )}
    </section>
  );
}
