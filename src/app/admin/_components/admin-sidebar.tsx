"use client";
import { Activity, ListChecks } from "lucide-react";
import { Sidebar, type SidebarItem } from "@/components/layout/sidebar";
import { ThemeToggle } from "@/components/layout/theme-toggle";

const ADMIN_NAV: SidebarItem[] = [
  { href: "/admin/ingestion-health", label: "Ingestion Health", icon: Activity },
  { href: "/admin/classification-review", label: "Classification Review", icon: ListChecks },
];

export function AdminSidebar({ activeHref }: { activeHref: string }) {
  return <Sidebar items={ADMIN_NAV} activeHref={activeHref} footer={<ThemeToggle />} />;
}
