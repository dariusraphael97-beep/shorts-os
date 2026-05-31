"use client";

import React, { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Send, Smartphone, Monitor, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

const RESEND_COOLDOWN_MS = 30_000;

interface Props {
  weeks: string[];
  initialWeek: string;
  initialHtml: string;
}

function PreviewFrame({
  html,
  width,
  label,
  icon: Icon,
}: {
  html: string;
  width: number;
  label: string;
  icon: typeof Smartphone;
}) {
  return (
    <div className="flex flex-col items-center gap-2">
      <div className="flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-wider text-[var(--text-tertiary)]">
        <Icon className="h-3.5 w-3.5" strokeWidth={1.75} />
        {label} · {width}px
      </div>
      <div
        className="overflow-hidden rounded-xl border border-[var(--border-subtle)] bg-white shadow-sm"
        style={{ width }}
      >
        <iframe
          title={`${label} email preview`}
          srcDoc={html}
          sandbox=""
          className="block h-[640px] w-full border-0"
        />
      </div>
    </div>
  );
}

export function DigestPreviewClient({ weeks, initialWeek, initialHtml }: Props) {
  const [week, setWeek] = useState(initialWeek);
  const [html, setHtml] = useState(initialHtml);
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [cooldownUntil, setCooldownUntil] = useState<number>(0);
  const [now, setNow] = useState<number>(Date.now());
  const firstRender = useRef(true);

  // Tick for the cooldown countdown.
  useEffect(() => {
    if (cooldownUntil <= Date.now()) return;
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, [cooldownUntil]);

  // Re-render the preview when the selected week changes (skip the initial mount,
  // which already has server-rendered HTML).
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const res = await fetch("/api/admin/digest-preview", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ weekStart: week }),
        });
        const body = (await res.json().catch(() => ({}))) as { ok?: boolean; html?: string; error?: string };
        if (cancelled) return;
        if (res.ok && body.ok && typeof body.html === "string") {
          setHtml(body.html);
        } else {
          toast.error(body.error ?? "Failed to render preview");
        }
      } catch (e) {
        if (!cancelled) toast.error(e instanceof Error ? e.message : "Preview request failed");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [week]);

  const cooldownRemaining = Math.max(0, Math.ceil((cooldownUntil - now) / 1000));
  const onCooldown = cooldownRemaining > 0;

  async function resend() {
    if (onCooldown || resending) return;
    setResending(true);
    try {
      const res = await fetch("/api/cron/digest-send?force=1", { method: "POST" });
      const body = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        result?: { status?: string };
        error?: string;
      };
      if (res.ok && body.ok) {
        const status = body.result?.status ?? "done";
        if (status === "sent") toast.success("Digest sent to your inbox");
        else if (status === "skipped") toast("Skipped — RESEND_API_KEY / DIGEST_RECIPIENT not set (logged)");
        else toast.error(`Send ${status}`);
      } else {
        toast.error(body.error ?? `Resend failed (${res.status})`);
      }
      setCooldownUntil(Date.now() + RESEND_COOLDOWN_MS);
      setNow(Date.now());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Resend request failed");
    } finally {
      setResending(false);
    }
  }

  return (
    <div>
      {/* Controls */}
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
          <span className="font-mono text-[11px] uppercase tracking-wider text-[var(--text-tertiary)]">
            Week
          </span>
          <select
            value={week}
            onChange={(e) => setWeek(e.target.value)}
            className={cn(
              "h-9 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-1)] px-3 text-sm text-[var(--text-primary)]",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/50",
            )}
          >
            {weeks.map((w) => (
              <option key={w} value={w}>
                {w}
              </option>
            ))}
          </select>
        </label>

        {loading && (
          <span className="inline-flex items-center gap-1.5 font-mono text-[11px] text-[var(--text-tertiary)]">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            rendering…
          </span>
        )}

        <div className="ml-auto">
          <Button onClick={() => void resend()} disabled={onCooldown || resending} variant="default" size="sm">
            {resending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
            {onCooldown ? `Resend in ${cooldownRemaining}s` : "Resend now"}
          </Button>
        </div>
      </div>

      {/* Frames */}
      <div className="flex flex-wrap items-start justify-center gap-8 lg:justify-start">
        <PreviewFrame html={html} width={375} label="Phone" icon={Smartphone} />
        <PreviewFrame html={html} width={640} label="Desktop" icon={Monitor} />
      </div>
    </div>
  );
}
