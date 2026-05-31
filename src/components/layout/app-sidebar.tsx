"use client";
import { usePathname } from "next/navigation";
import { Sparkles, FlaskConical, Eye, Swords, Settings } from "lucide-react";
import { Sidebar, type SidebarItem } from "@/components/layout/sidebar";
import { ThemeToggle } from "@/components/layout/theme-toggle";

// Mission Control + Clips are intentionally not surfaced for now (routes still exist).
const NAV: SidebarItem[] = [
  { href: "/niches", label: "Niches", icon: Sparkles },
  { href: "/lab", label: "Lab", icon: FlaskConical },
  { href: "/niches/watch-list", label: "Watch-list", icon: Eye },
  { href: "/competitors", label: "Competitors", icon: Swords },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function AppSidebar({ activeHref }: { activeHref?: string }) {
  const pathname = usePathname();
  return <Sidebar items={NAV} activeHref={activeHref ?? pathname} footer={<ThemeToggle />} />;
}
