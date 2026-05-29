"use client";

import React from "react";
import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

export interface EmptyStateProps {
  icon?: LucideIcon;
  illustration?: React.ReactNode;
  title: string;
  description?: string;
  action?: { label: string; onClick: () => void };
}

export function EmptyState({
  icon: Icon,
  illustration,
  title,
  description,
  action,
}: EmptyStateProps): React.JSX.Element {
  let media: React.ReactNode = null;

  if (illustration) {
    media = illustration;
  } else if (Icon) {
    media = (
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--surface-2)]">
        <Icon className="h-6 w-6 text-[var(--text-tertiary)]" strokeWidth={1.5} />
      </span>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center text-center py-16 max-w-sm mx-auto">
      {media}
      <p className="mt-4 text-base font-semibold text-[var(--text-primary)]">{title}</p>
      {description && (
        <p className="mt-1 text-sm text-[var(--text-secondary)]">{description}</p>
      )}
      {action && (
        <div className="mt-4">
          <Button variant="default" onClick={action.onClick}>
            {action.label}
          </Button>
        </div>
      )}
    </div>
  );
}
