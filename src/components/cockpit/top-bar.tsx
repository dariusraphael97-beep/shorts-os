import Link from "next/link";
import { HealthPill } from "./health-pill";

function todayLabel(): string {
  const d = new Date();
  return d.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function TopBar() {
  return (
    <header className="h-14 sticky top-0 z-30 flex items-center justify-between px-4 bg-elevated border-b border-subtle">
      <div className="flex items-center gap-3">
        <Link href="/" className="text-text-primary font-semibold tracking-tight">
          Shorts OS
        </Link>
        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-surface border border-subtle text-text-muted">
          v0.2.0
        </span>
      </div>

      <nav className="flex items-center gap-6 text-sm text-text-secondary">
        <span className="font-mono text-xs">{todayLabel()}</span>
        <Link href="/lab" className="hover:text-text-primary transition">Lab</Link>
        <Link href="/lab/drafts" className="hover:text-text-primary transition">Drafts</Link>
        <Link href="/clips" className="hover:text-text-primary transition">Clips</Link>
      </nav>

      <div className="flex items-center gap-3">
        <span className="text-xs font-mono text-text-muted">$0.00 today</span>
        <HealthPill />
      </div>
    </header>
  );
}
