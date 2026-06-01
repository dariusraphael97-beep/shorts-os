"use client";
import { usePathname } from "next/navigation";
import { Activity, ListChecks, Gauge, ShieldCheck, FileClock, DollarSign, HeartPulse } from "lucide-react";
import { Sidebar, type SidebarItem } from "@/components/layout/sidebar";
import { ThemeToggle } from "@/components/layout/theme-toggle";

const ADMIN_NAV: SidebarItem[] = [
  { href: "/admin/health", label: "Health", icon: HeartPulse },
  { href: "/admin/ingestion-health", label: "Ingestion Health", icon: Activity },
  { href: "/admin/classification-review", label: "Classification Review", icon: ListChecks },
  { href: "/admin/scoring-analysis", label: "Scoring Analysis", icon: Gauge },
  { href: "/admin/moat-validation", label: "Moat Validation", icon: ShieldCheck },
  { href: "/admin/costs", label: "Costs", icon: DollarSign },
  { href: "/admin/prompt-versions", label: "Prompt Versions", icon: FileClock },
];

export function AdminSidebar({ activeHref }: { activeHref?: string }) {
  const pathname = usePathname();
  return <Sidebar items={ADMIN_NAV} activeHref={activeHref ?? pathname} footer={<ThemeToggle />} />;
}
