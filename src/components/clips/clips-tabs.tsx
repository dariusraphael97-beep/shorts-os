"use client";
// src/components/clips/clips-tabs.tsx
//
// Plan #4 Phase 4: client-side tab switcher for /clips. Wraps Inbox /
// Candidates / Rendered server-component children. Local state only — no URL
// sync because the three tabs are mostly browse-and-act, not deep-link targets.

import { useState, type ReactNode } from "react";

type Tab = "inbox" | "candidates" | "rendered";

export function ClipsTabs(props: {
  inbox: ReactNode;
  candidates: ReactNode;
  rendered: ReactNode;
}) {
  const [tab, setTab] = useState<Tab>("inbox");
  const labels: Record<Tab, string> = {
    inbox: "Inbox",
    candidates: "Candidates",
    rendered: "Rendered",
  };
  return (
    <div>
      <nav className="flex gap-4 border-b border-border mb-4">
        {(Object.keys(labels) as Tab[]).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`pb-2 px-1 text-sm transition-colors ${
              tab === t
                ? "text-text-primary border-b-2 border-text-primary"
                : "text-text-secondary hover:text-text-primary"
            }`}
          >
            {labels[t]}
          </button>
        ))}
      </nav>
      {tab === "inbox" && props.inbox}
      {tab === "candidates" && props.candidates}
      {tab === "rendered" && props.rendered}
    </div>
  );
}
