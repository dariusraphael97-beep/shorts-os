"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Mail, Clock, Cpu, RotateCw, Loader2, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";

export interface NicheFinderConfig {
  digestEnabled: boolean;
  recipient: string | null;
  sendTime: string;
  topicModel: string;
  formatModel: string;
  embeddingModel: string;
}

function Section({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: typeof Mail;
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-1)]/40 p-6">
      <div className="mb-4 flex items-start gap-3">
        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--surface-2)] text-[var(--text-secondary)]">
          <Icon className="h-4 w-4" strokeWidth={1.75} />
        </span>
        <div>
          <h2 className="text-sm font-semibold text-[var(--text-primary)]">{title}</h2>
          {description && <p className="mt-0.5 text-xs text-[var(--text-secondary)]">{description}</p>}
        </div>
      </div>
      {children}
    </section>
  );
}

function EnvManagedBadge() {
  return (
    <Badge variant="outline" className="font-mono text-[10px] uppercase tracking-wider">
      env-managed
    </Badge>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 border-t border-[var(--border-subtle)] py-3 first:border-t-0">
      <span className="text-sm text-[var(--text-secondary)]">{label}</span>
      <div className="flex items-center gap-2">{children}</div>
    </div>
  );
}

export function SettingsClient({ config }: { config: NicheFinderConfig }) {
  const router = useRouter();
  const [resetting, setResetting] = useState(false);

  async function resetWeek() {
    if (resetting) return;
    setResetting(true);
    try {
      const res = await fetch("/api/admin/trigger-ingestion", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ job: "cluster_niches" }),
      });
      const body = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (res.ok && body.ok) {
        toast.success("Re-clustering this week's niches…");
        router.refresh();
      } else {
        toast.error(body.error ?? `Reset failed (${res.status})`);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Reset request failed");
    } finally {
      setResetting(false);
    }
  }

  return (
    <div className="flex max-w-2xl flex-col gap-5">
      <Section
        icon={Mail}
        title="Weekly digest"
        description="Delivery is controlled by environment variables — no fake save here."
      >
        <Field label="Digest enabled">
          <Switch checked={config.digestEnabled} disabled onCheckedChange={() => {}} />
          <EnvManagedBadge />
        </Field>
        <Field label="Recipient">
          {config.recipient ? (
            <span className="font-mono text-sm text-[var(--text-primary)]">{config.recipient}</span>
          ) : (
            <span className="text-sm text-[var(--text-tertiary)]">not set</span>
          )}
          <EnvManagedBadge />
        </Field>
        <p className="mt-2 text-xs text-[var(--text-tertiary)]">
          {config.digestEnabled
            ? "RESEND_API_KEY is set — the Monday cron will send."
            : "RESEND_API_KEY is not set — the cron renders and logs a 'skipped' run instead of sending."}
        </p>
      </Section>

      <Section icon={Clock} title="Schedule">
        <Field label="Digest send time">
          <span className="font-mono text-sm text-[var(--text-primary)]">{config.sendTime}</span>
        </Field>
        <Field label="Prediction close-loop">
          <span className="font-mono text-sm text-[var(--text-primary)]">Daily 13:00 UTC</span>
        </Field>
      </Section>

      <Section
        icon={Cpu}
        title="Classifier models"
        description="Runtime-swappable model strings (via env). Shown read-only."
      >
        <Field label="Topic model">
          <span className="font-mono text-sm text-[var(--text-primary)]">{config.topicModel}</span>
          <EnvManagedBadge />
        </Field>
        <Field label="Format model">
          <span className="font-mono text-sm text-[var(--text-primary)]">{config.formatModel}</span>
          <EnvManagedBadge />
        </Field>
        <Field label="Embedding model">
          <span className="font-mono text-sm text-[var(--text-primary)]">{config.embeddingModel}</span>
          <EnvManagedBadge />
        </Field>
      </Section>

      <Section
        icon={RotateCw}
        title="Maintenance"
        description="Re-run the weekly clustering pass for the current week."
      >
        <div className="flex items-center justify-between gap-4">
          <p className="text-sm text-[var(--text-secondary)]">
            Reset this week — re-clusters scored niches from the latest classifications.
          </p>
          <Button size="sm" variant="outline" onClick={() => void resetWeek()} disabled={resetting}>
            {resetting ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCw className="h-4 w-4" />}
            {resetting ? "Running…" : "Reset this week"}
          </Button>
        </div>
        <div className="mt-3 flex items-center justify-between gap-4 border-t border-[var(--border-subtle)] pt-3">
          <p className="text-sm text-[var(--text-secondary)]">
            Re-run setup — revisit your goals, interests, and watched channels.
          </p>
          <Link
            href="/onboarding"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-[var(--text-secondary)] underline-offset-4 outline-none transition-colors hover:text-[var(--text-primary)] hover:underline focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:rounded-sm"
          >
            <Wand2 className="h-4 w-4" strokeWidth={1.75} />
            Re-run setup
          </Link>
        </div>
      </Section>
    </div>
  );
}
