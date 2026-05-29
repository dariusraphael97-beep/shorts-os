"use client";

import type { LucideIcon } from "lucide-react";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { KeyboardShortcutHint } from "@/components/compositions/keyboard-shortcut-hint";

export interface CommandPaletteItem {
  id: string;
  label: string;
  icon?: LucideIcon;
  shortcut?: string[];
  onSelect: () => void;
}

export interface CommandPaletteGroup {
  heading: string;
  items: CommandPaletteItem[];
}

export interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  groups: CommandPaletteGroup[];
  /** @default "Search niches, videos, channels, agents…" */
  placeholder?: string;
}

export function CommandPalette({
  open,
  onOpenChange,
  groups,
  placeholder = "Search niches, videos, channels, agents…",
}: CommandPaletteProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="top-1/3 translate-y-0 overflow-hidden rounded-xl! p-0 bg-[var(--surface-overlay)] border-[var(--border-subtle)]"
        style={{
          backdropFilter: "var(--glass-blur)",
          WebkitBackdropFilter: "var(--glass-blur)",
        }}
      >
        <DialogHeader className="sr-only">
          <DialogTitle>Command Palette</DialogTitle>
          <DialogDescription>Search for a command to run</DialogDescription>
        </DialogHeader>
        <Command>
          <CommandInput placeholder={placeholder} />
          <CommandList>
            <CommandEmpty className="text-[var(--text-tertiary)]">
              No results found.
            </CommandEmpty>
            {groups.map((group, groupIndex) => (
              <span key={group.heading}>
                {groupIndex > 0 && <CommandSeparator />}
                <CommandGroup heading={group.heading}>
                  {group.items.map((item) => {
                    const Icon = item.icon;
                    return (
                      <CommandItem
                        key={item.id}
                        onSelect={() => {
                          item.onSelect();
                          onOpenChange(false);
                        }}
                      >
                        {Icon && (
                          <Icon
                            className="h-4 w-4 text-[var(--text-secondary)]"
                            strokeWidth={1.5}
                          />
                        )}
                        <span>{item.label}</span>
                        {item.shortcut && (
                          <span className="ml-auto">
                            <KeyboardShortcutHint keys={item.shortcut} />
                          </span>
                        )}
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
              </span>
            ))}
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
