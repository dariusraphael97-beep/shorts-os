import type { ReactNode } from "react"
import { AppCommandPalette } from "@/components/layout/app-command-palette"

export interface AppShellProps {
  sidebar: ReactNode
  children: ReactNode
  /** When true, render children full-bleed (no max-width/padding wrapper).
   * Used by migrated legacy pages that manage their own internal containers. */
  bare?: boolean
}

export function AppShell({ sidebar, children, bare = false }: AppShellProps) {
  return (
    <div className="flex min-h-screen">
      {sidebar}
      <main className="flex-1 min-w-0">
        {bare ? children : <div className="mx-auto max-w-[1280px] px-8 py-8">{children}</div>}
      </main>
      <AppCommandPalette />
    </div>
  )
}
