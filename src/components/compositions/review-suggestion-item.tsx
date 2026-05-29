"use client";

import { Button } from "@/components/ui/button";
import { Tappable } from "@/components/motion";
import { ToneBadge } from "@/components/compositions/tone-badge";
import { cn } from "@/lib/utils";

export type SuggestionStatus = "open" | "accepted" | "ignored";

export interface ReviewSuggestionItemProps {
  index: number;
  text: string;
  status: SuggestionStatus;
  onAccept?: (index: number) => void;
  onIgnore?: (index: number) => void;
  className?: string;
}

export function ReviewSuggestionItem({
  index,
  text,
  status,
  onAccept,
  onIgnore,
  className,
}: ReviewSuggestionItemProps) {
  const isOpen = status === "open";

  return (
    <div
      className={cn(
        "flex items-start justify-between gap-4 rounded-lg border border-[var(--border-subtle)] p-3",
        className
      )}
    >
      {/* Suggestion text */}
      <p className="min-w-0 flex-1 text-sm text-[var(--text-primary)]">{text}</p>

      {/* Right-side actions / status */}
      <div className="shrink-0 flex items-center gap-2">
        {/* Status badge for non-open states */}
        {!isOpen && (
          <ToneBadge
            spec={
              status === "accepted"
                ? { label: "Accepted", tone: "success" }
                : { label: "Ignored", tone: "muted" }
            }
          />
        )}

        {/* Action buttons — always rendered; disabled + dimmed when not open */}
        <div className={cn("flex items-center gap-2", !isOpen && "opacity-50")}>
          <Tappable>
            <Button
              variant="default"
              size="sm"
              disabled={!isOpen}
              onClick={() => onAccept?.(index)}
            >
              Accept
            </Button>
          </Tappable>
          <Tappable>
            <Button
              variant="ghost"
              size="sm"
              disabled={!isOpen}
              onClick={() => onIgnore?.(index)}
            >
              Ignore
            </Button>
          </Tappable>
        </div>
      </div>
    </div>
  );
}
