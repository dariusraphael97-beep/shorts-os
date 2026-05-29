import { cn } from "@/lib/utils";

interface KeyboardShortcutHintProps {
  keys: string[];
  className?: string;
}

export function KeyboardShortcutHint({ keys, className }: KeyboardShortcutHintProps) {
  return (
    <span className={cn("inline-flex items-center gap-0.5", className)}>
      {keys.map((key, i) => (
        <kbd
          key={i}
          className={cn(
            "inline-flex items-center justify-center",
            "min-w-[1.375rem] h-[1.375rem] px-1",
            "rounded-[var(--radius-sm)]",
            "border border-[var(--border-subtle)]",
            "bg-[var(--surface-2)]",
            "font-mono text-xs text-[var(--text-tertiary)]",
            "leading-none select-none",
          )}
        >
          {key}
        </kbd>
      ))}
    </span>
  );
}
