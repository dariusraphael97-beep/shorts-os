// src/components/lab/drafts-tabs.tsx
//
// Client component. Segmented-control tab switcher for /lab/drafts.
// Routing is preserved exactly: each tab pushes ?tab=<key> while keeping
// any other search params intact.

"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { FileText, Film, CalendarClock, Send } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

const TABS = [
  { key: "draft", label: "Draft", icon: FileText },
  { key: "rendered", label: "Rendered", icon: Film },
  { key: "scheduled", label: "Scheduled", icon: CalendarClock },
  { key: "posted", label: "Posted", icon: Send },
] as const satisfies readonly { key: string; label: string; icon: LucideIcon }[];

export type DraftsTab = (typeof TABS)[number]["key"];

export function DraftsTabs({ active }: { active: DraftsTab }) {
  const router = useRouter();
  const sp = useSearchParams();
  const prefersReducedMotion = useReducedMotion();

  function go(tab: DraftsTab) {
    const params = new URLSearchParams(sp.toString());
    params.set("tab", tab);
    router.push(`/lab/drafts?${params.toString()}`);
  }

  return (
    <div
      role="tablist"
      aria-label="Draft pipeline stage"
      className="inline-flex items-center gap-1 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-1)] p-1 shadow-[var(--elev-1)]"
    >
      {TABS.map((t) => {
        const Icon = t.icon;
        const isActive = t.key === active;
        return (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => go(t.key)}
            className={cn(
              "relative inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium outline-none transition-colors duration-[var(--duration-quick)]",
              "focus-visible:ring-2 focus-visible:ring-[var(--accent)]/50",
              isActive
                ? "text-[var(--text-primary)]"
                : "text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]",
            )}
          >
            {isActive && (
              <motion.span
                layoutId={prefersReducedMotion ? undefined : "drafts-tab-pill"}
                transition={{ type: "spring", stiffness: 400, damping: 32 }}
                className="absolute inset-0 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-2)] shadow-[var(--elev-1)]"
                aria-hidden
              />
            )}
            <Icon className="relative z-10 h-3.5 w-3.5" aria-hidden />
            <span className="relative z-10">{t.label}</span>
          </button>
        );
      })}
    </div>
  );
}
