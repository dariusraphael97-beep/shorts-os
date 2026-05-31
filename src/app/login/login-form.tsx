"use client";

import { useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { Eye, EyeOff, Lock } from "lucide-react";
import { loginAction } from "./actions";
import { Button } from "@/components/ui/button";
import { fadeRise } from "@/lib/motion";
import { cn } from "@/lib/utils";

/**
 * Sign-in form. Presentation only — the auth contract is preserved exactly:
 *   - <form action={loginAction}>
 *   - hidden `next` field (defaults to "/")
 *   - password input (name="password", required, autoFocus)
 *   - error surfaced from the page's searchParams
 *
 * Client component purely so we can run the mount motion (respecting
 * prefers-reduced-motion) and the local show/hide password toggle. None of
 * that touches the server action or the submitted form data.
 */
export function LoginForm({ next, error }: { next: string; error?: string }) {
  const prefersReducedMotion = useReducedMotion();
  const [revealed, setRevealed] = useState(false);

  const motionProps = prefersReducedMotion
    ? {}
    : {
        variants: fadeRise,
        initial: "initial" as const,
        animate: "animate" as const,
      };

  return (
    <motion.div {...motionProps} className="flex flex-col gap-7">
      <header className="flex flex-col items-center gap-4 text-center">
        <span
          aria-hidden
          className="flex h-12 w-12 items-center justify-center rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--surface-2)] text-[var(--accent)] shadow-[var(--elev-1)]"
        >
          <Lock className="h-5 w-5" strokeWidth={1.5} />
        </span>
        <div className="flex flex-col gap-1.5">
          <h1 className="text-xl font-semibold tracking-tight text-[var(--text-primary)]">
            Shorts OS
          </h1>
          <p className="text-sm text-[var(--text-secondary)]">
            Sign in to continue
          </p>
        </div>
      </header>

      <form action={loginAction} className="flex flex-col gap-4">
        <input type="hidden" name="next" value={next} />

        <div className="flex flex-col gap-1.5">
          <label
            htmlFor="password"
            className="text-xs font-medium text-[var(--text-secondary)]"
          >
            Password
          </label>
          <div
            className={cn(
              "flex h-11 items-center gap-2 rounded-[var(--radius-md)] border bg-[var(--surface-2)] pl-3 pr-1.5 transition-colors",
              "border-[var(--border-subtle)] focus-within:border-[var(--accent)]",
              error && "border-[var(--danger)]/60",
            )}
          >
            <input
              id="password"
              type={revealed ? "text" : "password"}
              name="password"
              autoFocus
              required
              autoComplete="current-password"
              placeholder="Enter your password"
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? "login-error" : undefined}
              className="h-full min-w-0 flex-1 bg-transparent text-sm text-[var(--text-primary)] outline-none placeholder:text-[var(--text-tertiary)]"
            />
            <button
              type="button"
              onClick={() => setRevealed((v) => !v)}
              aria-label={revealed ? "Hide password" : "Show password"}
              aria-pressed={revealed}
              tabIndex={-1}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--radius-sm)] text-[var(--text-tertiary)] outline-none transition-colors hover:text-[var(--text-secondary)] focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
            >
              {revealed ? (
                <EyeOff className="h-4 w-4" strokeWidth={1.5} />
              ) : (
                <Eye className="h-4 w-4" strokeWidth={1.5} />
              )}
            </button>
          </div>
        </div>

        {error && (
          <p
            id="login-error"
            role="alert"
            className="text-sm leading-relaxed text-[var(--danger)]"
          >
            {error}
          </p>
        )}

        <Button type="submit" size="lg" className="mt-1 h-11 w-full">
          Sign in
        </Button>
      </form>
    </motion.div>
  );
}
