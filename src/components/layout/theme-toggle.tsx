"use client"

import { useEffect, useState } from "react"
import { useTheme } from "next-themes"
import { Sun, Moon } from "lucide-react"

import { Button } from "@/components/ui/button"

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  function handleToggle() {
    setTheme(resolvedTheme === "dark" ? "light" : "dark")
  }

  if (!mounted) {
    // Placeholder same size as the real button — avoids hydration mismatch
    // because resolvedTheme is undefined on the server.
    return (
      <Button
        variant="ghost"
        size="icon"
        aria-label="Toggle theme"
        disabled
        aria-hidden
        className="text-[var(--text-tertiary)]"
      >
        <Moon className="h-4 w-4 opacity-0" strokeWidth={1.5} aria-hidden />
      </Button>
    )
  }

  const isDark = resolvedTheme === "dark"

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={handleToggle}
      aria-label="Toggle theme"
      className="text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"
    >
      {isDark ? (
        <Sun className="h-4 w-4" strokeWidth={1.5} aria-hidden />
      ) : (
        <Moon className="h-4 w-4" strokeWidth={1.5} aria-hidden />
      )}
    </Button>
  )
}
