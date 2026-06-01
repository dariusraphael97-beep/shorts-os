"use client";

import Link from "next/link";
import {
  Compass,
  Eye,
  Sparkles,
  ShieldCheck,
  LineChart,
  Scissors,
  Bot,
  type LucideIcon,
} from "lucide-react";
import { HoverLift } from "@/components/motion/hover-lift";
import { AssistantStatusDot } from "@/components/compositions/assistant-status-dot";
import { Badge } from "@/components/ui/badge";
import type { AgentCardVM } from "@/lib/agents/dashboard/load";

// ─── Icon lookup ────────────────────────────────────────────────────────────
// Maps an assistant's `icon_name` (db value) to a lucide component.
const ICONS: Record<string, LucideIcon> = {
  compass: Compass,
  eye: Eye,
  sparkles: Sparkles,
  "shield-check": ShieldCheck,
  "line-chart": LineChart,
  scissors: Scissors,
};

function iconFor(name: string): LucideIcon {
  return ICONS[name] ?? Bot;
}

// ─── Phase lookup ───────────────────────────────────────────────────────────
// Disabled placeholders advertise the phase that ships them.
const COMING_PHASE: Record<string, string> = {
  analyst: "Phase 4",
  editor_copilot: "Phase 3",
};

function comingPhaseFor(id: string): string {
  return COMING_PHASE[id] ?? "a future phase";
}

// ─── Relative time ──────────────────────────────────────────────────────────
function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / (60 * 1000));
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

// ─── Inner content (shared by enabled + disabled variants) ───────────────────
function CardBody({ vm, disabled }: { vm: AgentCardVM; disabled: boolean }) {
  const Icon = iconFor(vm.iconName);

  return (
    <div
      className="flex h-full flex-col gap-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-1)] p-5"
      style={disabled ? { boxShadow: "var(--elev-1)" } : undefined}
      data-disabled={disabled ? "true" : undefined}
    >
      {/* Header row: icon tile + name/role, status corner */}
      <div className="flex items-start gap-3">
        <div
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-[var(--border-subtle)]"
          style={{
            backgroundColor: disabled ? "var(--surface-2)" : "var(--accent-muted)",
            color: disabled ? "var(--text-tertiary)" : "var(--accent)",
          }}
          aria-hidden
        >
          <Icon className="h-5 w-5" strokeWidth={1.75} />
        </div>

        <div className="min-w-0 flex-1">
          <h3
            className="truncate text-[15px] font-semibold leading-tight"
            style={{ color: disabled ? "var(--text-secondary)" : "var(--text-primary)" }}
          >
            {vm.displayName}
          </h3>
          <p className="mt-0.5 truncate text-xs text-[var(--text-tertiary)]">
            {vm.roleDescription}
          </p>
        </div>

        {!disabled && (
          <span className="mt-1 shrink-0">
            <AssistantStatusDot status={vm.state} />
          </span>
        )}
      </div>

      {/* Current activity / coming-soon line */}
      {disabled ? (
        <div className="mt-auto">
          <Badge variant="outline" className="text-[11px] text-[var(--text-tertiary)]">
            Coming in {comingPhaseFor(vm.id)}
          </Badge>
        </div>
      ) : (
        <>
          <div className="min-h-[1.25rem]">
            {vm.currentActivity ? (
              <p
                className="line-clamp-2 text-[13px] leading-snug text-[var(--text-secondary)]"
                title={vm.currentActivity}
              >
                {vm.currentActivity}
              </p>
            ) : (
              <p className="text-[13px] italic text-[var(--text-tertiary)]">Idle</p>
            )}
          </div>

          {/* Recent activity — quiet, tertiary */}
          {vm.recent.length > 0 && (
            <ul className="mt-auto space-y-1.5 border-t border-[var(--border-subtle)] pt-3">
              {vm.recent.map((r) => (
                <li
                  key={r.id}
                  className="flex items-baseline gap-2 text-[11px] text-[var(--text-tertiary)]"
                >
                  <span className="truncate" title={r.summary}>
                    {r.summary}
                  </span>
                  <span className="ml-auto shrink-0 font-mono tabular-nums">
                    {relativeTime(r.created_at)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}

// ─── AgentCard ──────────────────────────────────────────────────────────────
export function AgentCard({ vm }: { vm: AgentCardVM }) {
  if (!vm.isEnabled) {
    return (
      <div className="h-full opacity-70" aria-label={`${vm.displayName} — not yet available`}>
        <CardBody vm={vm} disabled />
      </div>
    );
  }

  return (
    <HoverLift className="h-full rounded-xl">
      <Link
        href={`/agents/${vm.id}`}
        className="block h-full rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2"
        aria-label={`${vm.displayName} — ${vm.currentActivity ?? "idle"}`}
      >
        <CardBody vm={vm} disabled={false} />
      </Link>
    </HoverLift>
  );
}
