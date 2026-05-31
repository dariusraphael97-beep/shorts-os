"use client";
import { usePathname } from "next/navigation";
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
  { href: "/settings", label: "Settings", icon: Settings },
];

export function AppSidebar({ activeHref }: { activeHref?: string }) {
  const pathname = usePathname();
  return <Sidebar items={NAV} activeHref={activeHref ?? pathname} footer={<ThemeToggle />} />;
}
