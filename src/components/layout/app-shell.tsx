import type { ReactNode } from "react"

export interface AppShellProps {
  sidebar: ReactNode
  children: ReactNode
}

export function AppShell({ sidebar, children }: AppShellProps) {
  return (
    <div className="flex min-h-screen">
      {sidebar}
      <main className="flex-1 min-w-0">
        <div className="mx-auto max-w-[1280px] px-8 py-8">{children}</div>
      </main>
    </div>
  )
}
