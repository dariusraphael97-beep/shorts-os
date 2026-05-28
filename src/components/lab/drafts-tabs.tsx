// src/components/lab/drafts-tabs.tsx
"use client";

import { useRouter, useSearchParams } from "next/navigation";

const TABS = [
  { key: "draft", label: "Draft" },
  { key: "rendered", label: "Rendered" },
  { key: "scheduled", label: "Scheduled" },
  { key: "posted", label: "Posted" },
] as const;

export type DraftsTab = (typeof TABS)[number]["key"];

export function DraftsTabs({ active }: { active: DraftsTab }) {
  const router = useRouter();
  const sp = useSearchParams();

  function go(tab: DraftsTab) {
    const params = new URLSearchParams(sp.toString());
    params.set("tab", tab);
    router.push(`/lab/drafts?${params.toString()}`);
  }

  return (
    <div className="flex gap-1 border-b border-subtle">
      {TABS.map((t) => (
        <button
          key={t.key}
          onClick={() => go(t.key)}
          className={[
            "px-4 py-2 text-sm font-medium border-b-2 -mb-px transition",
            t.key === active
              ? "border-accent-electric text-text-primary"
              : "border-transparent text-text-muted hover:text-text-primary",
          ].join(" ")}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}
