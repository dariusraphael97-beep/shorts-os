"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  Sparkles,
  Eye,
  Send,
  Swords,
  Settings,
  Bot,
  Compass,
  ShieldCheck,
} from "lucide-react";
import {
  CommandPalette,
  type CommandPaletteGroup,
} from "@/components/layout/command-palette";
import { useCommandPalette } from "@/components/layout/use-command-palette";

function isTypingTarget(el: EventTarget | null): boolean {
  const node = el as HTMLElement | null;
  if (!node) return false;
  const tag = node.tagName?.toLowerCase();
  return tag === "input" || tag === "textarea" || tag === "select" || node.isContentEditable;
}

export function AppCommandPalette() {
  const router = useRouter();
  const { open, setOpen } = useCommandPalette();
  const gPressedAt = useRef<number>(0);

  // Global `g n` chord → /niches (mirrors the j/k vocabulary in the feed).
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (isTypingTarget(e.target)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const now = Date.now();
      if (e.key === "g") {
        gPressedAt.current = now;
        return;
      }
      if (e.key === "n" && now - gPressedAt.current < 600) {
        gPressedAt.current = 0;
        router.push("/niches");
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [router]);

  const go = (href: string) => () => router.push(href);

  const groups: CommandPaletteGroup[] = [
    {
      heading: "Niches",
      items: [
        { id: "niches-week", label: "Niches: this week", icon: Sparkles, shortcut: ["g", "n"], onSelect: go("/niches") },
        { id: "watch-list-add", label: "Watch-list: add channel", icon: Eye, onSelect: go("/niches/watch-list") },
        { id: "digest-preview", label: "Digest: preview latest", icon: Send, onSelect: go("/niches/digest-preview") },
        { id: "competitors-add", label: "Competitors: add channel", icon: Swords, onSelect: go("/competitors") },
        { id: "settings-niche-finder", label: "Settings: niche finder", icon: Settings, onSelect: go("/settings/niche-finder") },
      ],
    },
    {
      heading: "Agents",
      items: [
        { id: "agents-dashboard", label: "Agents: dashboard", icon: Bot, onSelect: go("/agents") },
        { id: "agents-niche-scout", label: "Agents: Niche Scout", icon: Compass, onSelect: go("/agents/niche_scout") },
        { id: "agents-watch-list-curator", label: "Agents: Watch-list Curator", icon: Eye, onSelect: go("/agents/watch_list_curator") },
        { id: "agents-generator", label: "Agents: Generator", icon: Sparkles, onSelect: go("/agents/generator") },
        { id: "agents-reviewer", label: "Agents: Reviewer", icon: ShieldCheck, onSelect: go("/agents/video_reviewer") },
      ],
    },
  ];

  return <CommandPalette open={open} onOpenChange={setOpen} groups={groups} />;
}
