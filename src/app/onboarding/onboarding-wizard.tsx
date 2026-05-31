"use client";

import { useCallback, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  DollarSign,
  Sparkles,
  TrendingUp,
  Users,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { CreatorGoal } from "@/lib/supabase/repositories/channels";
import { Button } from "@/components/ui/button";
import { fadeRise } from "@/lib/motion";
import { cn } from "@/lib/utils";

type WizardState = {
  step: number; // 0..5  (6-step flow total)
  creatorGoals: CreatorGoal | null; // step 1
  interests: string[]; // step 2
  admiredUrls: string[]; // step 3 (built in Task 8)
  alsoCompetitor: Record<string, boolean>; // step 3 (built in Task 8)
};

const TOTAL_STEPS = 6;

const GOAL_OPTIONS: ReadonlyArray<{
  value: CreatorGoal;
  label: string;
  description: string;
  icon: LucideIcon;
}> = [
  {
    value: "monetize",
    label: "Monetize my channel",
    description: "Turn views into revenue.",
    icon: DollarSign,
  },
  {
    value: "grow_subscribers",
    label: "Grow subscribers",
    description: "Build a loyal, growing audience.",
    icon: Users,
  },
  {
    value: "test_niche",
    label: "Test a new niche",
    description: "Validate an idea before going all in.",
    icon: TrendingUp,
  },
  {
    value: "other",
    label: "Other",
    description: "Something else — we'll adapt.",
    icon: Sparkles,
  },
];

export function OnboardingWizard() {
  const prefersReducedMotion = useReducedMotion();
  const [state, setState] = useState<WizardState>({
    step: 0,
    creatorGoals: null,
    interests: [],
    admiredUrls: [],
    alsoCompetitor: {},
  });

  const goNext = useCallback(() => {
    setState((s) => ({ ...s, step: Math.min(s.step + 1, TOTAL_STEPS - 1) }));
  }, []);
  const goBack = useCallback(() => {
    setState((s) => ({ ...s, step: Math.max(s.step - 1, 0) }));
  }, []);

  const setGoal = useCallback((goal: CreatorGoal) => {
    setState((s) => ({ ...s, creatorGoals: goal }));
  }, []);

  const addInterest = useCallback((raw: string) => {
    const value = raw.trim();
    if (!value) return;
    setState((s) =>
      s.interests.some((t) => t.toLowerCase() === value.toLowerCase())
        ? s
        : { ...s, interests: [...s.interests, value] },
    );
  }, []);
  const removeInterest = useCallback((tag: string) => {
    setState((s) => ({ ...s, interests: s.interests.filter((t) => t !== tag) }));
  }, []);

  const motionProps = prefersReducedMotion
    ? {}
    : {
        variants: fadeRise,
        initial: "initial" as const,
        animate: "animate" as const,
        exit: "exit" as const,
      };

  return (
    <div className="flex flex-col gap-8">
      <Stepper current={state.step} />

      <div className="relative overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[var(--surface-1)] shadow-[var(--elev-2)]">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div key={state.step} {...motionProps} className="p-8 sm:p-10">
            {state.step === 0 && <WelcomeStep onStart={goNext} />}
            {state.step === 1 && (
              <GoalsStep selected={state.creatorGoals} onSelect={setGoal} />
            )}
            {state.step === 2 && (
              <InterestsStep
                interests={state.interests}
                onAdd={addInterest}
                onRemove={removeInterest}
              />
            )}
            {state.step >= 3 && <PlaceholderStep />}
          </motion.div>
        </AnimatePresence>
      </div>

      {state.step > 0 && (
        <Footer
          step={state.step}
          state={state}
          onBack={goBack}
          onNext={goNext}
        />
      )}
    </div>
  );
}

function Stepper({ current }: { current: number }) {
  return (
    <div
      className="flex items-center gap-2"
      role="progressbar"
      aria-valuemin={1}
      aria-valuemax={TOTAL_STEPS}
      aria-valuenow={current + 1}
      aria-label={`Step ${current + 1} of ${TOTAL_STEPS}`}
    >
      {Array.from({ length: TOTAL_STEPS }, (_, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <span
            key={i}
            className={cn(
              "h-1 flex-1 rounded-full transition-colors duration-[var(--duration-smooth)]",
              done && "bg-[var(--accent)]",
              active && "bg-[var(--accent)]",
              !done && !active && "bg-[var(--surface-2)]",
            )}
          />
        );
      })}
    </div>
  );
}

function StepHeading({
  eyebrow,
  title,
  subhead,
}: {
  eyebrow?: string;
  title: string;
  subhead?: string;
}) {
  return (
    <div className="flex flex-col gap-2">
      {eyebrow && (
        <span className="text-xs font-medium uppercase tracking-wide text-[var(--text-tertiary)]">
          {eyebrow}
        </span>
      )}
      <h1 className="text-balance text-2xl font-semibold leading-tight text-[var(--text-primary)]">
        {title}
      </h1>
      {subhead && (
        <p className="text-sm leading-relaxed text-[var(--text-secondary)]">
          {subhead}
        </p>
      )}
    </div>
  );
}

function WelcomeStep({ onStart }: { onStart: () => void }) {
  return (
    <div className="flex flex-col items-center gap-8 py-6 text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-[var(--radius-lg)] bg-[var(--accent-muted)]">
        <Sparkles className="h-7 w-7 text-[var(--accent)]" strokeWidth={1.5} />
      </span>
      <div className="flex flex-col gap-3">
        <h1 className="text-balance text-3xl font-semibold leading-tight text-[var(--text-primary)]">
          Find proven niches, generate videos, ship better
        </h1>
        <p className="mx-auto max-w-md text-sm leading-relaxed text-[var(--text-secondary)]">
          A quick setup so your co-pilot knows what to look for — and what to
          make.
        </p>
      </div>
      <Button size="lg" onClick={onStart} autoFocus className="px-5">
        Get started
        <ArrowRight strokeWidth={1.5} />
      </Button>
    </div>
  );
}

function GoalsStep({
  selected,
  onSelect,
}: {
  selected: CreatorGoal | null;
  onSelect: (goal: CreatorGoal) => void;
}) {
  return (
    <div className="flex flex-col gap-6">
      <StepHeading
        eyebrow="Step 2 of 6"
        title="What's your main goal?"
        subhead="We'll tune niche discovery and ideas around this. You can change it later."
      />
      <div
        role="radiogroup"
        aria-label="Creator goal"
        className="grid grid-cols-1 gap-3 sm:grid-cols-2"
      >
        {GOAL_OPTIONS.map((option) => {
          const isSelected = selected === option.value;
          const Icon = option.icon;
          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={isSelected}
              onClick={() => onSelect(option.value)}
              className={cn(
                "group/goal relative flex items-start gap-3 rounded-[var(--radius-md)] border p-4 text-left transition-all duration-[var(--duration-quick)] outline-none",
                "focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--surface-1)]",
                isSelected
                  ? "border-[var(--accent)] bg-[var(--accent-muted)]"
                  : "border-[var(--border-subtle)] bg-[var(--surface-2)] hover:border-[var(--border-strong)]",
              )}
            >
              <span
                className={cn(
                  "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--radius-sm)] transition-colors",
                  isSelected
                    ? "bg-[var(--accent)] text-[var(--accent-foreground)]"
                    : "bg-[var(--surface-1)] text-[var(--text-secondary)]",
                )}
              >
                <Icon className="h-4 w-4" strokeWidth={1.5} />
              </span>
              <span className="flex flex-col gap-0.5">
                <span className="text-sm font-medium text-[var(--text-primary)]">
                  {option.label}
                </span>
                <span className="text-xs leading-relaxed text-[var(--text-secondary)]">
                  {option.description}
                </span>
              </span>
              {isSelected && (
                <Check
                  className="absolute right-3 top-3 h-4 w-4 text-[var(--accent)]"
                  strokeWidth={2}
                />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function InterestsStep({
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
    <div className="flex flex-col gap-6">
      <StepHeading
        eyebrow="Step 3 of 6"
        title="What topics are you into?"
        subhead="Add a few interests so we surface niches you'd actually make videos about."
      />
      <div className="flex flex-col gap-2">
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
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={handleKeyDown}
            onBlur={commit}
            placeholder={
              interests.length === 0 ? "e.g. fitness, finance, AI tools…" : "Add another…"
            }
            aria-label="Add an interest"
            className="h-7 min-w-32 flex-1 bg-transparent text-sm text-[var(--text-primary)] outline-none placeholder:text-[var(--text-tertiary)]"
          />
        </div>
        <p className="text-xs text-[var(--text-tertiary)]">
          Press Enter to add. Backspace on an empty field removes the last tag.
        </p>
      </div>
    </div>
  );
}

function PlaceholderStep() {
  return (
    <div className="flex flex-col items-center gap-3 py-10 text-center">
      <h1 className="text-xl font-semibold text-[var(--text-primary)]">
        More steps coming
      </h1>
      <p className="max-w-sm text-sm leading-relaxed text-[var(--text-secondary)]">
        Admired channels and connecting your account land next. Use Back to
        revisit your goals and interests.
      </p>
    </div>
  );
}

function Footer({
  step,
  state,
  onBack,
  onNext,
}: {
  step: number;
  state: WizardState;
  onBack: () => void;
  onNext: () => void;
}) {
  const canContinue =
    step === 1 ? state.creatorGoals !== null : true;
  const showSkip = step === 2 && state.interests.length === 0;

  return (
    <div className="flex items-center justify-between gap-3">
      <Button variant="ghost" size="lg" onClick={onBack}>
        <ArrowLeft strokeWidth={1.5} />
        Back
      </Button>
      <div className="flex items-center gap-2">
        {showSkip && (
          <Button variant="ghost" size="lg" onClick={onNext}>
            Skip for now
          </Button>
        )}
        <Button
          size="lg"
          onClick={onNext}
          disabled={!canContinue}
          className="px-5"
        >
          Continue
          <ArrowRight strokeWidth={1.5} />
        </Button>
      </div>
    </div>
  );
}
