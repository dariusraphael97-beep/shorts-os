"use client";
// src/components/clips/clips-tabs.tsx
//
// Premium client-side tab switcher for /clips. Token-driven active-tab
// treatment matching the design system. Wraps Inbox / Candidates / Rendered
// server-component children. Local state only — no URL sync.

import { useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

type Tab = "inbox" | "candidates" | "rendered";

const LABELS: Record<Tab, string> = {
  inbox: "Inbox",
  candidates: "Candidates",
  rendered: "Rendered",
};

export function ClipsTabs(props: {
  inbox: ReactNode;
  candidates: ReactNode;
  rendered: ReactNode;
}) {
  const [tab, setTab] = useState<Tab>("inbox");

  return (
    <div>
      {/* Tab bar */}
      <nav
        className="flex gap-0.5 border-b border-[var(--border-subtle)] mb-6"
        role="tablist"
        aria-label="Clips sections"
      >
        {(Object.keys(LABELS) as Tab[]).map((t) => {
          const active = tab === t;
          return (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setTab(t)}
              className={cn(
                "relative px-4 pb-3 pt-0.5 text-sm font-medium transition-colors duration-150",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] rounded-t-sm",
                active
                  ? "text-[var(--text-primary)]"
                  : "text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]",
              )}
            >
              {LABELS[t]}
              {/* Active indicator bar */}
              {active && (
                <span
                  aria-hidden
                  className="absolute bottom-0 left-0 right-0 h-0.5 rounded-full bg-[var(--accent)]"
                />
              )}
            </button>
          );
        })}
      </nav>

      {/* Tab panels */}
      <div role="tabpanel">
        {tab === "inbox" && props.inbox}
        {tab === "candidates" && props.candidates}
        {tab === "rendered" && props.rendered}
      </div>
    </div>
  );
}
