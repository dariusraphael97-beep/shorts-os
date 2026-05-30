"use client";
import { LayoutDashboard, Sparkles, FlaskConical, Film, Eye, Swords, Settings } from "lucide-react";
import { Sidebar, type SidebarItem } from "@/components/layout/sidebar";
import { ThemeToggle } from "@/components/layout/theme-toggle";

const NAV: SidebarItem[] = [
  { href: "/mission-control", label: "Mission Control", icon: LayoutDashboard },
  { href: "/niches", label: "Niches", icon: Sparkles },
  { href: "/lab", label: "Lab", icon: FlaskConical },
  { href: "/clips", label: "Clips", icon: Film },
  { href: "/niches/watch-list", label: "Watch-list", icon: Eye },
  { href: "/competitors", label: "Competitors", icon: Swords },
  { href: "/settings/niche-finder", label: "Settings", icon: Settings },
];

export function AppSidebar({ activeHref }: { activeHref: string }) {
  return <Sidebar items={NAV} activeHref={activeHref} footer={<ThemeToggle />} />;
}
