"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { signIn, signOut, useSession } from "next-auth/react";

export function AccountNav({ isAdminView = false }: { isAdminView?: boolean }) {
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
    setName("");
  }

  if (status === "authenticated") {
    return (
      <div className="auth-panel">
        <div className="dropdown">
          <button className={`btn btn-auth hover-dropdown ${isAdminView ? "text-danger border-danger" : ""}`}>
            {data.user?.name ?? "USER"}
          </button>
          <div className="dropdown-content">
            <Link href="/saved">Open Workspace</Link>
            {(data.user as { role?: string } | undefined)?.role === "admin" ? <Link href="/ingestion">Admin Systems</Link> : null}
            <button type="button" className="dropdown-action text-danger" onClick={() => signOut({ redirect: false })}>
              Log Out
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-panel auth-inline-form">
      <form onSubmit={onSignIn} className="auth-inline-form">
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          className="tech-input nav-auth-input"
          placeholder="AUTHENTICATE [USER]"
        />
        <button type="submit" disabled={pending} className="btn btn-auth">
          {pending ? "SIGNING_IN" : "AUTH"}
        </button>
      </form>
    </div>
  );
}
