"use client";

import {
  CheckCircle2,
  XCircle,
  MonitorPlay,
  Hash,
  Globe,
  Link2,
  ShieldCheck,
} from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { ConnectYouTubeButton } from "@/components/settings/connect-youtube-button";
import { fadeRise } from "@/lib/motion";

export interface ChannelSettingsView {
  displayName: string;
  slug: string;
  platform: string;
  externalChannelId: string | null;
  ytConnected: boolean;
  connectedBanner: boolean;
  errorBanner: string | null;
}

function DetailRow({
  icon: Icon,
  label,
  children,
}: {
  icon: typeof Hash;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4 border-t border-[var(--border-subtle)] py-3 first:border-t-0">
      <span className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
        <Icon className="h-4 w-4 text-[var(--text-tertiary)]" strokeWidth={1.75} aria-hidden />
        {label}
      </span>
      <div className="min-w-0 text-right">{children}</div>
    </div>
  );
}

export function ChannelSettingsClient({ view }: { view: ChannelSettingsView }) {
  const prefersReducedMotion = useReducedMotion();
  const variants = prefersReducedMotion ? undefined : fadeRise;

  return (
    <motion.div
      initial="initial"
      animate="animate"
      transition={prefersReducedMotion ? undefined : { staggerChildren: 0.06 }}
      className="flex max-w-2xl flex-col gap-5"
    >
      {/* Success / error banners — design-system alert styling */}
      {view.connectedBanner && (
        <motion.div
          variants={variants}
          role="status"
          aria-live="polite"
          className="flex items-start gap-3 rounded-xl border border-[var(--success)]/30 bg-[var(--success)]/10 px-4 py-3"
        >
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[var(--success)]" aria-hidden />
          <p className="text-sm text-[var(--text-primary)]">
            YouTube connected. Upload jobs will now use this account.
          </p>
        </motion.div>
      )}
      {view.errorBanner && (
        <motion.div
          variants={variants}
          role="alert"
          className="flex items-start gap-3 rounded-xl border border-[var(--danger)]/30 bg-[var(--danger)]/10 px-4 py-3"
        >
          <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-[var(--danger)]" aria-hidden />
          <p className="text-sm text-[var(--text-primary)]">
            OAuth failed: <span className="font-mono text-[var(--danger)]">{view.errorBanner}</span>
          </p>
        </motion.div>
      )}

      {/* PRIMARY — connection status + connect action */}
      <motion.section
        variants={variants}
        className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-1)]/40 p-6"
      >
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--surface-2)] text-[var(--text-secondary)]">
              <MonitorPlay className="h-5 w-5" strokeWidth={1.75} aria-hidden />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-semibold text-[var(--text-primary)]">YouTube account</h2>
                {view.ytConnected ? (
                  <span className="inline-flex items-center gap-1 rounded-full border border-[var(--success)]/30 bg-[var(--success)]/10 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-[var(--success)]">
                    <CheckCircle2 className="h-3 w-3" aria-hidden />
                    Connected
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded-full border border-[var(--border-strong)] bg-[var(--surface-2)] px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-[var(--text-tertiary)]">
                    Not connected
                  </span>
                )}
              </div>
              <p className="mt-1 max-w-sm text-xs text-[var(--text-secondary)]">
                {view.ytConnected
                  ? "Upload jobs publish to this account. Reconnect to refresh authorization if uploads start failing."
                  : "Connect a YouTube account so the Lab can publish finished videos on your behalf."}
              </p>
            </div>
          </div>
          <div className="shrink-0 sm:pt-0.5">
            <ConnectYouTubeButton connected={view.ytConnected} />
          </div>
        </div>
      </motion.section>

      {/* SECONDARY — channel details, tidy key/value layout */}
      <motion.section
        variants={variants}
        className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-1)]/40 p-6"
      >
        <div className="mb-4">
          <h2 className="text-sm font-semibold text-[var(--text-primary)]">Channel details</h2>
          <p className="mt-0.5 text-xs text-[var(--text-secondary)]">
            The active channel used across the Lab and scheduling.
          </p>
        </div>

        <DetailRow icon={Hash} label="Display name">
          <span className="text-sm font-medium text-[var(--text-primary)]">{view.displayName}</span>
        </DetailRow>
        <DetailRow icon={Link2} label="Slug">
          <span className="font-mono text-sm text-[var(--text-secondary)]">{view.slug}</span>
        </DetailRow>
        <DetailRow icon={Globe} label="Platform">
          <span className="inline-flex items-center rounded-md border border-[var(--border-subtle)] bg-[var(--surface-2)] px-2 py-0.5 font-mono text-xs capitalize text-[var(--text-secondary)]">
            {view.platform}
          </span>
        </DetailRow>
        <DetailRow icon={ShieldCheck} label="External channel ID">
          {view.externalChannelId ? (
            <span className="font-mono text-sm text-[var(--text-secondary)]">{view.externalChannelId}</span>
          ) : (
            <span className="text-sm text-[var(--text-tertiary)]">not set</span>
          )}
        </DetailRow>
        <DetailRow icon={MonitorPlay} label="YouTube OAuth">
          {view.ytConnected ? (
            <span className="inline-flex items-center gap-1 text-sm font-medium text-[var(--success)]">
              <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
              Connected
            </span>
          ) : (
            <span className="text-sm text-[var(--text-tertiary)]">Not connected</span>
          )}
        </DetailRow>
      </motion.section>
    </motion.div>
  );
}
