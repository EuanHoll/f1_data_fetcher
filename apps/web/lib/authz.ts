type ViewerIdentity = {
  id?: string | null;
  email?: string | null;
};

function parseList(value: string | undefined) {
  return new Set(
    String(value ?? "")
      .split(",")
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean)
  );
}

export function resolveViewerRole(viewer: ViewerIdentity) {
  const adminSubjects = parseList(process.env.ADMIN_AUTH_SUBJECTS);
  const adminEmails = parseList(process.env.ADMIN_EMAILS);

  const subject = String(viewer.id ?? "").trim().toLowerCase();
  const email = String(viewer.email ?? "").trim().toLowerCase();
  const isAdmin = (subject && adminSubjects.has(subject)) || (email && adminEmails.has(email));

  return isAdmin ? "admin" : "user";
}

export function isViewerAdmin(viewer: ViewerIdentity) {
  return resolveViewerRole(viewer) === "admin";
}
