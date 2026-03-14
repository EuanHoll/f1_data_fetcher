import Link from "next/link";

type ModuleNavProps = {
  activeModule: "home" | "explore" | "compare" | "saved" | "admin";
  isAdmin: boolean;
};

const modules = [
  { key: "home", href: "/", label: "Module 01: Home" },
  { key: "explore", href: "/explore", label: "Module 02: Explore" },
  { key: "compare", href: "/compare", label: "Module 03: Compare" },
  { key: "saved", href: "/saved", label: "Module 04: Saved" }
] as const;

export function ModuleNav({ activeModule, isAdmin }: ModuleNavProps) {
  return (
    <div className="nav-modules">
      {modules.map((module) => (
        <Link key={module.key} href={module.href} className={`nav-module ${activeModule === module.key ? "active" : ""}`}>
          {module.label}
        </Link>
      ))}
      {isAdmin ? (
        <Link href="/ingestion" className={`nav-module ${activeModule === "admin" ? "active" : ""}`}>
          Module 05: Core Systems
        </Link>
      ) : null}
    </div>
  );
}
