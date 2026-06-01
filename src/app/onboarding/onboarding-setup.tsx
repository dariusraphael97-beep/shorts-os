"use client";

import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ArrowRight, Eye, Loader2, Swords, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConnectYouTubeButton } from "@/components/settings/connect-youtube-button";
import { ScanFeed } from "@/components/onboarding/scan-feed";
import { fadeRise } from "@/lib/motion";
import { parseChannelUrls } from "@/lib/onboarding/parse-channel-urls";
import { cn } from "@/lib/utils";

/**
 * First-run setup — one calm screen, not a funnel.
 *
 * The product's whole point is that *it* does the work of finding niches, so we
 * don't interrogate the operator for goals. Connecting a channel is the single
 * primary action (it's the one seed the tool can't self-source); everything
 * else is explicitly optional. The CTA works even with nothing filled in.
 */
export function OnboardingSetup() {
  const router = useRouter();
  const prefersReducedMotion = useReducedMotion();

  const [interests, setInterests] = useState<string[]>([]);
  const [admiredUrls, setAdmiredUrls] = useState<string[]>([]);
  const [alsoCompetitor, setAlsoCompetitor] = useState<Record<string, boolean>>({});

  const [finishing, setFinishing] = useState(false);
  // Best-effort, non-blocking: how many admired channels we couldn't add.
  const [failedAdds, setFailedAdds] = useState(0);
  const [finishError, setFinishError] = useState<string | null>(null);
  // After a successful complete, show the live scan feed instead of the form.
  const [scanning, setScanning] = useState(false);

  // --- interests (de-emphasized, optional) ---------------------------------
  const addInterest = useCallback((raw: string) => {
    const value = raw.trim();
    if (!value) return;
    setInterests((prev) =>
      prev.some((t) => t.toLowerCase() === value.toLowerCase())
        ? prev
        : [...prev, value],
    );
  }, []);
  const removeInterest = useCallback((tag: string) => {
    setInterests((prev) => prev.filter((t) => t !== tag));
  }, []);

  // --- admired channels (optional) -----------------------------------------
  const syncAdmiredUrls = useCallback((raw: string) => {
    const parsed = parseChannelUrls(raw);
    setAdmiredUrls(parsed);
    setAlsoCompetitor((prev) => {
      // Drop competitor flags for URLs no longer present.
      const next: Record<string, boolean> = {};
      for (const url of parsed) {
        if (prev[url]) next[url] = true;
      }
      return next;
    });
  }, []);
  const removeAdmiredUrl = useCallback((url: string) => {
    setAdmiredUrls((prev) => prev.filter((u) => u !== url));
    setAlsoCompetitor((prev) => {
      const { [url]: _removed, ...rest } = prev;
      return rest;
    });
  }, []);
  const toggleCompetitor = useCallback((url: string) => {
    setAlsoCompetitor((prev) => ({ ...prev, [url]: !prev[url] }));
  }, []);

  // --- finish ---------------------------------------------------------------
  const handleFinish = useCallback(async () => {
    if (finishing) return;
    setFinishing(true);
    setFinishError(null);
    setFailedAdds(0);

    // 1) Seed the watch-list (and competitors where flagged). Per-URL failures
    //    are tolerated — one bad handle must never block starting.
    let failures = 0;
    for (const url of admiredUrls) {
      const payload = JSON.stringify({ urlOrHandle: url });
      try {
        const res = await fetch("/api/watch-list/channels", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: payload,
        });
        if (!res.ok) failures += 1;
        if (alsoCompetitor[url]) {
          try {
            await fetch("/api/watch-list/competitors", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: payload,
            });
          } catch {
            /* competitor flag is additive; ignore its failure */
          }
        }
      } catch {
        failures += 1;
      }
    }
    if (failures > 0) setFailedAdds(failures);

    // 2) Persist interests + mark onboarding complete + kick the first scan.
    //    No creatorGoals — we don't ask for goals anymore.
    try {
      const res = await fetch("/api/onboarding/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ interests }),
      });
      if (!res.ok) {
        setFinishError("Couldn't finish setup. Please try again.");
        setFinishing(false);
        return;
      }
    } catch {
      setFinishError("Couldn't reach the server. Please try again.");
      setFinishing(false);
      return;
    }

    // 3) Background scan is already running; show the live scan feed.
    setFinishing(false);
    setScanning(true);
  }, [admiredUrls, alsoCompetitor, finishing, interests]);

  const motionProps = prefersReducedMotion
    ? {}
    : {
        variants: fadeRise,
        initial: "initial" as const,
        animate: "animate" as const,
      };

  // After a successful complete, swap the form out for the live scan feed.
  if (scanning) {
    return <ScanFeed onDone={() => router.push("/niches")} />;
  }

  return (
    <motion.div {...motionProps} className="flex flex-col gap-10">
      {/* Heading — first person, ownership, no "tell us about yourself" */}
      <header className="flex flex-col gap-3">
        <h1 className="text-balance text-3xl font-semibold leading-tight tracking-tight text-[var(--text-primary)]">
          Let&apos;s point your co-pilot at your channel
        </h1>
        <p className="max-w-md text-[15px] leading-relaxed text-[var(--text-secondary)]">
          Connect your channel and it starts finding niches worth making.
          Everything else is optional — you can start with nothing but a
          connection.
        </p>
      </header>

      {/* Primary action — the one thing that matters */}
      <ConnectBlock />

      {/* Optionals, clearly secondary */}
      <div className="flex flex-col gap-8">
        <AdmiredChannelsField
          urls={admiredUrls}
          alsoCompetitor={alsoCompetitor}
          onChange={syncAdmiredUrls}
          onRemove={removeAdmiredUrl}
          onToggleCompetitor={toggleCompetitor}
        />
        <InterestsField
          interests={interests}
          onAdd={addInterest}
          onRemove={removeInterest}
        />
      </div>

      {/* CTA — always enabled */}
      <div className="flex flex-col gap-3 border-t border-[var(--border-subtle)] pt-6">
        <Button
          size="lg"
          onClick={() => void handleFinish()}
          disabled={finishing}
          autoFocus
          className="self-start px-5"
        >
          {finishing ? (
            <>
              <Loader2 className="animate-spin" strokeWidth={1.5} />
              Getting things ready…
            </>
          ) : (
            <>
              Start finding niches
              <ArrowRight strokeWidth={1.5} />
            </>
          )}
        </Button>

        <div aria-live="polite" className="min-h-4">
          {failedAdds > 0 && !finishError && (
            <p className="text-xs text-[var(--text-tertiary)]">
              Couldn&apos;t add {failedAdds} channel
              {failedAdds === 1 ? "" : "s"} — you can add{" "}
              {failedAdds === 1 ? "it" : "them"} later from your watch-list.
            </p>
          )}
          {finishError && (
            <p className="text-xs text-[var(--accent-red)]">{finishError}</p>
          )}
        </div>
      </div>
    </motion.div>
  );
}

/** The single primary action. Most prominent block on the screen. */
function ConnectBlock() {
  return (
    <section className="relative overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[var(--surface-1)] p-6 shadow-[var(--elev-1)]">
      <span
        aria-hidden
        className="pointer-events-none absolute -right-16 -top-16 h-40 w-40 rounded-full bg-[var(--accent)]/10 blur-3xl"
      />
      <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-1.5">
          <h2 className="text-base font-semibold text-[var(--text-primary)]">
            Connect your channel
          </h2>
          <p className="max-w-sm text-sm leading-relaxed text-[var(--text-secondary)]">
            It needs your channel for analytics and to tailor niches to what
            already works for you.
          </p>
        </div>
        <div className="shrink-0">
          <ConnectYouTubeButton connected={false} />
        </div>
      </div>
    </section>
  );
}

function OptionalLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-baseline gap-2">
      <span className="text-sm font-medium text-[var(--text-primary)]">
        {children}
      </span>
      <span className="text-xs font-normal text-[var(--text-tertiary)]">
        optional
      </span>
    </div>
  );
}

function AdmiredChannelsField({
  urls,
  alsoCompetitor,
  onChange,
  onRemove,
  onToggleCompetitor,
}: {
  urls: string[];
  alsoCompetitor: Record<string, boolean>;
  onChange: (raw: string) => void;
  onRemove: (url: string) => void;
  onToggleCompetitor: (url: string) => void;
}) {
  const [draft, setDraft] = useState(() => urls.join("\n"));

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      setDraft(e.target.value);
      onChange(e.target.value);
    },
    [onChange],
  );

  // Removing a chip must rewrite the draft too, or the dropped line resurfaces
  // on the next keystroke (the textarea is the source of truth).
  const handleRemove = useCallback(
    (url: string) => {
      setDraft(urls.filter((u) => u !== url).join("\n"));
      onRemove(url);
    },
    [urls, onRemove],
  );

  return (
    <div className="flex flex-col gap-2.5">
      <label htmlFor="admired-channels" className="flex flex-col gap-1">
        <OptionalLabel>Channels to watch</OptionalLabel>
        <span className="text-xs leading-relaxed text-[var(--text-tertiary)]">
          Paste channels you admire or compete with — it&apos;ll watch them for
          trending formats. New lines or commas.
        </span>
      </label>
      <textarea
        id="admired-channels"
        value={draft}
        onChange={handleChange}
        rows={3}
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
        placeholder={"https://youtube.com/@channel\n@handle, @another…"}
        className="w-full resize-y rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--surface-2)] px-3 py-2.5 text-sm leading-relaxed text-[var(--text-primary)] outline-none transition-colors placeholder:text-[var(--text-tertiary)] focus:border-[var(--accent)]"
      />

      {urls.length > 0 && (
        <ul className="flex flex-col gap-2">
          <AnimatePresence initial={false}>
            {urls.map((url) => {
              const isCompetitor = Boolean(alsoCompetitor[url]);
              return (
                <motion.li
                  key={url}
                  layout
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.15 }}
                  className="flex items-center gap-2 rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--surface-2)] py-1.5 pl-3 pr-1.5"
                >
                  <Eye
                    className="h-3.5 w-3.5 shrink-0 text-[var(--text-tertiary)]"
                    strokeWidth={1.5}
                  />
                  <span className="min-w-0 flex-1 truncate text-sm text-[var(--text-primary)]">
                    {url}
                  </span>
                  <button
                    type="button"
                    onClick={() => onToggleCompetitor(url)}
                    aria-pressed={isCompetitor}
                    aria-label={
                      isCompetitor
                        ? `Stop tracking ${url} as a competitor`
                        : `Also track ${url} as a competitor`
                    }
                    className={cn(
                      "inline-flex shrink-0 items-center gap-1 rounded-[var(--radius-sm)] px-2 py-1 text-xs font-medium transition-colors outline-none",
                      "focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--surface-2)]",
                      isCompetitor
                        ? "bg-[var(--accent)] text-[var(--accent-foreground)]"
                        : "bg-[var(--surface-1)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]",
                    )}
                  >
                    <Swords className="h-3 w-3" strokeWidth={1.5} />
                    Competitor
                  </button>
                  <button
                    type="button"
                    aria-label={`Remove ${url}`}
                    onClick={() => handleRemove(url)}
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[var(--radius-sm)] text-[var(--text-tertiary)] transition-colors outline-none hover:bg-[var(--surface-1)] hover:text-[var(--text-primary)] focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
                  >
                    <X className="h-4 w-4" strokeWidth={1.5} />
                  </button>
                </motion.li>
              );
            })}
          </AnimatePresence>
        </ul>
      )}
    </div>
  );
}

function InterestsField({
  interests,
  onAdd,
  onRemove,
}: {
  interests: string[];
  onAdd: (value: string) => void;
  onRemove: (tag: string) => void;
}) {
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const commit = useCallback(() => {
    onAdd(draft);
    setDraft("");
  }, [draft, onAdd]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") {
        e.preventDefault();
        commit();
      } else if (e.key === "Backspace" && draft === "" && interests.length > 0) {
        e.preventDefault();
        onRemove(interests[interests.length - 1]);
      }
    },
    [commit, draft, interests, onRemove],
  );

  return (
    <div className="flex flex-col gap-2.5">
      <label htmlFor="interests" className="flex flex-col gap-1">
        <OptionalLabel>Prioritize a topic</OptionalLabel>
        <span className="text-xs leading-relaxed text-[var(--text-tertiary)]">
          Anything you want it to look at first? Add a few — it&apos;ll still
          scan everything.
        </span>
      </label>
      <div
        onClick={() => inputRef.current?.focus()}
        className="flex min-h-11 w-full cursor-text flex-wrap items-center gap-2 rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--surface-2)] px-3 py-2 transition-colors focus-within:border-[var(--accent)]"
      >
        <AnimatePresence initial={false}>
          {interests.map((tag) => (
            <motion.span
              key={tag}
              layout
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              transition={{ duration: 0.15 }}
              className="inline-flex items-center gap-1 rounded-[var(--radius-sm)] bg-[var(--accent-muted)] py-1 pl-2.5 pr-1.5 text-xs font-medium text-[var(--accent)]"
            >
              {tag}
              <button
                type="button"
                aria-label={`Remove ${tag}`}
                onClick={(e) => {
                  e.stopPropagation();
                  onRemove(tag);
                }}
                className="flex h-4 w-4 items-center justify-center rounded-full transition-colors hover:bg-[var(--accent)]/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
              >
                <X className="h-3 w-3" strokeWidth={2} />
              </button>
            </motion.span>
          ))}
        </AnimatePresence>
        <input
          ref={inputRef}
          id="interests"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={commit}
          placeholder={
            interests.length === 0 ? "e.g. fitness, finance, AI tools…" : "Add another…"
          }
          aria-label="Add a topic to prioritize"
          className="h-7 min-w-32 flex-1 bg-transparent text-sm text-[var(--text-primary)] outline-none placeholder:text-[var(--text-tertiary)]"
        />
      </div>
    </div>
  );
}
