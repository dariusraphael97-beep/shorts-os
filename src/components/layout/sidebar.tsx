"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { ChevronLeft, ChevronRight } from "lucide-react"
import type { LucideIcon } from "lucide-react"

import { cn } from "@/lib/utils"
import { resolveActiveHref } from "@/components/layout/sidebar-active"
import { Button } from "@/components/ui/button"
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip"

export interface SidebarItem {
  href: string
  label: string
  icon: LucideIcon
}

export interface SidebarProps {
  items: SidebarItem[]
  activeHref?: string
  footer?: React.ReactNode
}

export function Sidebar({ items, activeHref, footer }: SidebarProps) {
  // Hydration-safe: start with stable default (expanded) on both server and
  // first client render; read localStorage in useEffect to avoid mismatch.
  const [collapsed, setCollapsed] = useState(false)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
    if (typeof window !== "undefined") {
      const stored = window.localStorage.getItem("shorts-os.sidebar.collapsed")
      if (stored !== null) {
        setCollapsed(stored === "true")
      }
    }
  }, [])

  function toggleCollapsed() {
    const next = !collapsed
    setCollapsed(next)
    if (typeof window !== "undefined") {
      window.localStorage.setItem("shorts-os.sidebar.collapsed", String(next))
    }
  }

  // Until mounted we use server-rendered collapsed=false; suppress any
  // width transition until after mount so we don't flash.
  const width = !mounted ? 260 : collapsed ? 64 : 260
  const resolvedActive = resolveActiveHref(activeHref ?? "", items.map((i) => i.href))

  return (
    <aside
      style={{
        width,
        backdropFilter: "var(--glass-blur)",
        WebkitBackdropFilter: "var(--glass-blur)",
      }}
      className={cn(
        "flex h-screen flex-col sticky top-0 shrink-0",
        "bg-[var(--surface-overlay)] border-r border-[var(--border-subtle)]",
        mounted
          ? "transition-[width] duration-200 ease-[cubic-bezier(0.4,0,0.2,1)] motion-reduce:transition-none"
          : "transition-none",
        "overflow-hidden"
      )}
    >
      {/* Logo / wordmark area */}
      <div className="flex h-14 items-center px-3 shrink-0">
        <div
          className={cn(
            "flex items-center gap-2.5 overflow-hidden",
            "transition-opacity duration-200 motion-reduce:transition-none"
          )}
        >
          {/* Icon mark — always visible */}
          <div className="size-7 rounded-[var(--radius-sm)] bg-[var(--accent)] shrink-0 flex items-center justify-center">
            <svg
              width="14"
              height="14"
              viewBox="0 0 14 14"
              fill="none"
              aria-hidden="true"
            >
              <path
                d="M3 2.5L11 7L3 11.5V2.5Z"
                fill="white"
                strokeWidth="0"
              />
            </svg>
          </div>
          {/* Wordmark — hidden when collapsed */}
          <span
            className={cn(
              "text-sm font-semibold text-[var(--text-primary)] whitespace-nowrap",
              "transition-[opacity,max-width] duration-200 motion-reduce:transition-none",
              collapsed ? "opacity-0 max-w-0" : "opacity-100 max-w-[160px]"
            )}
          >
            Shorts OS
          </span>
        </div>
      </div>

      {/* Nav items */}
      <nav className="flex-1 px-2 py-1 space-y-0.5 overflow-y-auto overflow-x-hidden">
        {items.map((item) => {
          const Icon = item.icon
          const isActive = item.href === resolvedActive

          const rowContent = (
            <Link
              href={item.href}
              className={cn(
                "relative flex items-center gap-3 rounded-[var(--radius-sm)] px-2.5 h-10",
                "text-sm font-medium",
                "transition-colors duration-[var(--duration-quick)] motion-reduce:transition-none",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/50",
                isActive
                  ? "bg-[var(--accent-muted)] text-[var(--accent)]"
                  : "text-[var(--text-secondary)] hover:bg-muted hover:text-[var(--text-primary)]"
              )}
            >
              {/* Left accent bar for active */}
              {isActive && (
                <span
                  className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 rounded-full bg-[var(--accent)]"
                  aria-hidden="true"
                />
              )}
              <Icon
                className="h-5 w-5 shrink-0"
                strokeWidth={1.5}
                aria-hidden="true"
              />
              <span
                className={cn(
                  "whitespace-nowrap",
                  "transition-[opacity,max-width] duration-200 motion-reduce:transition-none",
                  collapsed ? "opacity-0 max-w-0 overflow-hidden" : "opacity-100 max-w-[200px]"
                )}
              >
                {item.label}
              </span>
            </Link>
          )

          if (collapsed) {
            return (
              <Tooltip key={item.href}>
                <TooltipTrigger render={rowContent} />
                <TooltipContent side="right">{item.label}</TooltipContent>
              </Tooltip>
            )
          }

          return <div key={item.href}>{rowContent}</div>
        })}
      </nav>

      {/* Footer slot + collapse toggle */}
      <div className="shrink-0 px-2 pb-3 pt-2 space-y-1">
        {footer && (
          <div
            className={cn(
              "flex items-center",
              collapsed ? "justify-center" : "px-1"
            )}
          >
            {footer}
          </div>
        )}
        <div className={cn("flex", collapsed ? "justify-center" : "justify-end px-1")}>
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleCollapsed}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            className="text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"
          >
            {collapsed ? (
              <ChevronRight className="h-4 w-4" strokeWidth={1.5} />
            ) : (
              <ChevronLeft className="h-4 w-4" strokeWidth={1.5} />
            )}
          </Button>
        </div>
      </div>
    </aside>
  )
}
