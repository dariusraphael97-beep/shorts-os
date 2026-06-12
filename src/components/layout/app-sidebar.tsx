"use client";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Sparkles, Eye, Swords, Settings, Clapperboard } from "lucide-react";
import { Sidebar, type SidebarItem } from "@/components/layout/sidebar";
import { ThemeToggle } from "@/components/layout/theme-toggle";

// Post-pivot nav: /niches is home; Lab + Clips demoted (routes stay reachable
// by URL — deleting their code is a separate cleanup task).
const NAV: SidebarItem[] = [
  { href: "/niches", label: "Niches", icon: Sparkles },
  { href: "/mission-control", label: "Mission Control", icon: LayoutDashboard },
  { href: "/lab/longform", label: "Longform", icon: Clapperboard },
  { href: "/niches/watch-list", label: "Watch-list", icon: Eye },
  { href: "/competitors", label: "Competitors", icon: Swords },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function AppSidebar({ activeHref }: { activeHref?: string }) {
  const pathname = usePathname();
  return <Sidebar items={NAV} activeHref={activeHref ?? pathname} footer={<ThemeToggle />} />;
}
