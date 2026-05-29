// THROWAWAY — design-system visual review surface. Delete in Sub-phase J.
"use client"

import React, { useState } from "react"
import { AnimatePresence } from "motion/react"
import { toast } from "sonner"
import {
  Compass,
  Sparkles,
  Film,
  Settings,
  Wand2,
  Search,
  Telescope,
  BookOpen,
  Loader2,
  Info,
  RefreshCw,
  PlusCircle,
  Trash2,
  Copy,
  Download,
  Star,
} from "lucide-react"
import type { ColumnDef } from "@tanstack/react-table"

// Layout
import { AppShell } from "@/components/layout/app-shell"
import { Sidebar } from "@/components/layout/sidebar"
import type { SidebarItem } from "@/components/layout/sidebar"
import { PageHeader } from "@/components/layout/page-header"
import { ThemeToggle } from "@/components/layout/theme-toggle"
import { CommandPalette } from "@/components/layout/command-palette"
import type { CommandPaletteGroup } from "@/components/layout/command-palette"
import { useCommandPalette } from "@/components/layout/use-command-palette"

// Motion
import { PageTransition } from "@/components/motion/page-transition"
import { HoverLift } from "@/components/motion/hover-lift"
import { Tappable } from "@/components/motion/tappable"
import { ModalMotion } from "@/components/motion/modal-motion"

// Primitives
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select"
import {
  Combobox,
  ComboboxInput,
  ComboboxContent,
  ComboboxList,
  ComboboxItem,
  ComboboxEmpty,
} from "@/components/ui/combobox"
import { Switch } from "@/components/ui/switch"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Slider } from "@/components/ui/slider"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "@/components/ui/accordion"
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import {
  Sheet,
  SheetTrigger,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet"
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
  PopoverHeader,
  PopoverTitle,
  PopoverDescription,
} from "@/components/ui/popover"
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip"
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu"
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { Skeleton } from "@/components/ui/skeleton"
import { Separator } from "@/components/ui/separator"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Calendar } from "@/components/ui/calendar"
import { DataTable } from "@/components/ui/data-table"

// Compositions
import { NicheCard } from "@/components/compositions/niche-card"
import { AssistantCard } from "@/components/compositions/assistant-card"
import { MissionControlGrid } from "@/components/compositions/mission-control-grid"
import { ReviewScorecard } from "@/components/compositions/review-scorecard"
import type { ReviewDimension } from "@/components/compositions/review-scorecard"
import {
  ReviewSuggestionItem,
  type SuggestionStatus,
} from "@/components/compositions/review-suggestion-item"
import { DiscoveryStateBadge } from "@/components/compositions/discovery-state-badge"
import { ProductionFitBadge } from "@/components/compositions/production-fit-badge"
import { ProvenBandBadge } from "@/components/compositions/proven-band-badge"
import { OutlierBadge } from "@/components/compositions/outlier-badge"
import { AssistantStatusDot } from "@/components/compositions/assistant-status-dot"
import { KeyboardShortcutHint } from "@/components/compositions/keyboard-shortcut-hint"
import { VelocitySparkline } from "@/components/compositions/velocity-sparkline"
import { EmptyState } from "@/components/compositions/empty-state"

// ─────────────────────────────────────────────
// Sidebar nav items
// ─────────────────────────────────────────────
const NAV_ITEMS: SidebarItem[] = [
  { href: "#", label: "Discover", icon: Compass },
  { href: "#niches", label: "Niches", icon: Sparkles },
  { href: "#videos", label: "Videos", icon: Film },
  { href: "#settings", label: "Settings", icon: Settings },
]

// ─────────────────────────────────────────────
// DataTable shape
// ─────────────────────────────────────────────
interface NicheRow {
  niche: string
  velocity: string
  fit: string
}

const NICHE_COLUMNS: ColumnDef<NicheRow, string>[] = [
  { accessorKey: "niche", header: "Niche" },
  { accessorKey: "velocity", header: "Velocity" },
  { accessorKey: "fit", header: "Fit" },
]

const NICHE_ROWS: NicheRow[] = [
  { niche: "Budget travel vlogs", velocity: "+18%/wk", fit: "High" },
  { niche: "Quiet productivity setups", velocity: "+12%/wk", fit: "High" },
  { niche: "Retro gaming reviews", velocity: "+6%/wk", fit: "Medium" },
  { niche: "One-pan recipes", velocity: "+9%/wk", fit: "High" },
]

// ─────────────────────────────────────────────
// Section wrapper
// ─────────────────────────────────────────────
function SectionLabel({ label }: { label: string }) {
  return (
    <p
      className="mb-3 font-mono text-xs uppercase tracking-widest"
      style={{ color: "var(--text-tertiary)" }}
    >
      {label}
    </p>
  )
}

function SectionCard({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <div
      className={`rounded-xl border p-5 ${className ?? ""}`}
      style={{
        background: "var(--surface-1)",
        borderColor: "var(--border-subtle)",
      }}
    >
      {children}
    </div>
  )
}

// ─────────────────────────────────────────────
// Section 1: Tokens
// ─────────────────────────────────────────────
const COLOR_TOKENS = [
  "bg",
  "surface-1",
  "surface-2",
  "border-subtle",
  "border-strong",
  "text-primary",
  "text-secondary",
  "text-tertiary",
  "accent",
  "accent-hover",
  "accent-muted",
  "success",
  "warning",
  "danger",
] as const

const BORDER_TOKENS = ["border-subtle", "border-strong"] as const

const TYPE_STEPS = [
  { name: "xs", token: "--text-xs" },
  { name: "sm", token: "--text-sm" },
  { name: "base", token: "--text-base" },
  { name: "md", token: "--text-md" },
  { name: "lg", token: "--text-lg" },
  { name: "xl", token: "--text-xl" },
  { name: "2xl", token: "--text-2xl" },
  { name: "3xl", token: "--text-3xl" },
  { name: "4xl", token: "--text-4xl" },
] as const

function TokensSection() {
  return (
    <section className="space-y-8">
      <PageHeader
        title="Tokens"
        description="Toggle dark/light via the sidebar to verify every token resolves correctly."
      />

      {/* Color swatches */}
      <SectionCard>
        <SectionLabel label="Color tokens" />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-7">
          {COLOR_TOKENS.map((token) => {
            const isBorder = (BORDER_TOKENS as readonly string[]).includes(token)
            return (
              <div key={token} className="flex flex-col gap-1.5">
                <div
                  className="h-10 w-full rounded-lg border"
                  style={
                    isBorder
                      ? {
                          background: "transparent",
                          borderColor: `var(--${token})`,
                          borderWidth: 2,
                        }
                      : {
                          background: `var(--${token})`,
                          borderColor: "var(--border-subtle)",
                        }
                  }
                />
                <p
                  className="break-all font-mono text-[10px] leading-tight"
                  style={{ color: "var(--text-tertiary)" }}
                >
                  --{token}
                </p>
              </div>
            )
          })}
        </div>
      </SectionCard>

      {/* Type scale */}
      <SectionCard>
        <SectionLabel label="Type scale" />
        <div className="space-y-2">
          {TYPE_STEPS.map(({ name, token }) => (
            <div key={name} className="flex items-baseline gap-4">
              <span
                className="w-10 shrink-0 font-mono text-[10px]"
                style={{ color: "var(--text-tertiary)" }}
              >
                {name}
              </span>
              <span
                style={{
                  fontSize: `var(${token})`,
                  color: "var(--text-primary)",
                  lineHeight: 1.3,
                }}
              >
                The quick brown fox
              </span>
              <span
                className="ml-auto font-mono text-[10px] shrink-0"
                style={{ color: "var(--text-tertiary)" }}
              >
                {token}
              </span>
            </div>
          ))}
        </div>
      </SectionCard>

      {/* Elevation */}
      <SectionCard>
        <SectionLabel label="Elevation" />
        <div className="flex flex-wrap gap-6">
          {(["--elev-1", "--elev-2", "--elev-3"] as const).map((token, i) => (
            <div
              key={token}
              className="flex h-20 w-36 items-center justify-center rounded-xl"
              style={{
                background: "var(--surface-2)",
                boxShadow: `var(${token})`,
              }}
            >
              <p
                className="font-mono text-xs"
                style={{ color: "var(--text-tertiary)" }}
              >
                {token}
              </p>
            </div>
          ))}
        </div>
      </SectionCard>

      {/* Radii */}
      <SectionCard>
        <SectionLabel label="Radii" />
        <div className="flex flex-wrap gap-6">
          {(
            [
              ["--radius-sm", "sm"],
              ["--radius-md", "md"],
              ["--radius-lg", "lg"],
              ["--radius-xl", "xl"],
            ] as const
          ).map(([token, name]) => (
            <div
              key={token}
              className="flex h-16 w-28 items-center justify-center border"
              style={{
                borderRadius: `var(${token})`,
                background: "var(--surface-2)",
                borderColor: "var(--border-subtle)",
              }}
            >
              <p
                className="font-mono text-[10px]"
                style={{ color: "var(--text-tertiary)" }}
              >
                {name}
              </p>
            </div>
          ))}
        </div>
      </SectionCard>
    </section>
  )
}

// ─────────────────────────────────────────────
// Section 2: Primitives
// ─────────────────────────────────────────────
function PrimitivesSection() {
  const [switchVal, setSwitchVal] = useState(false)
  const [radioVal, setRadioVal] = useState("option-a")
  const [sliderVal, setSliderVal] = useState([40])
  const [calDate, setCalDate] = useState<Date | undefined>(new Date())

  return (
    <section className="space-y-8">
      <PageHeader
        title="Primitives"
        description="All Base-UI-backed primitives in their interesting states."
      />

      {/* Buttons */}
      <SectionCard>
        <SectionLabel label="Button variants × sizes" />
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="default">Default</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="outline">Outline</Button>
          <Button variant="destructive">Destructive</Button>
          <Button variant="link">Link</Button>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <Button size="sm">Small</Button>
          <Button size="default">Default</Button>
          <Button size="lg">Large</Button>
          <Button size="icon" variant="outline">
            <Star className="h-4 w-4" strokeWidth={1.5} />
          </Button>
          <Button disabled>Disabled</Button>
          <Button disabled variant="outline">
            <Loader2 className="mr-1.5 h-4 w-4 animate-spin" strokeWidth={1.5} />
            Loading…
          </Button>
        </div>
      </SectionCard>

      {/* Form inputs */}
      <SectionCard>
        <SectionLabel label="Form inputs" />
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="sb-input">Input</Label>
            <Input id="sb-input" placeholder="Type something…" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sb-select">Select</Label>
            <Select>
              <SelectTrigger id="sb-select" className="w-full">
                <SelectValue placeholder="Pick a niche…" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="travel">Budget travel</SelectItem>
                <SelectItem value="gaming">Retro gaming</SelectItem>
                <SelectItem value="food">One-pan recipes</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="sb-textarea">Textarea</Label>
            <Textarea
              id="sb-textarea"
              placeholder="Describe your niche idea…"
              rows={3}
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Combobox</Label>
            <Combobox>
              <ComboboxInput placeholder="Search niches…" showClear />
              <ComboboxContent>
                <ComboboxList>
                  <ComboboxEmpty>No results.</ComboboxEmpty>
                  <ComboboxItem value="travel">Budget travel</ComboboxItem>
                  <ComboboxItem value="gaming">Retro gaming</ComboboxItem>
                  <ComboboxItem value="food">One-pan recipes</ComboboxItem>
                  <ComboboxItem value="productivity">Productivity setups</ComboboxItem>
                </ComboboxList>
              </ComboboxContent>
            </Combobox>
          </div>
        </div>
      </SectionCard>

      {/* Toggle controls */}
      <SectionCard>
        <SectionLabel label="Toggle controls" />
        <div className="flex flex-wrap items-center gap-8">
          <div className="flex items-center gap-2">
            <Switch
              checked={switchVal}
              onCheckedChange={setSwitchVal}
              id="sb-switch"
            />
            <Label htmlFor="sb-switch">
              {switchVal ? "On" : "Off"}
            </Label>
          </div>
          <div className="space-y-2">
            <Label>Radio group</Label>
            <RadioGroup
              value={radioVal}
              onValueChange={setRadioVal}
              className="flex gap-4"
            >
              {["option-a", "option-b", "option-c"].map((v) => (
                <div key={v} className="flex items-center gap-1.5">
                  <RadioGroupItem value={v} id={`sb-radio-${v}`} />
                  <Label htmlFor={`sb-radio-${v}`}>{v}</Label>
                </div>
              ))}
            </RadioGroup>
          </div>
          <div className="w-48 space-y-1.5">
            <Label>Slider — {sliderVal[0]}</Label>
            <Slider
              value={sliderVal}
              onValueChange={(v: number | readonly number[]) => {
                if (Array.isArray(v)) setSliderVal(v as number[])
              }}
              min={0}
              max={100}
            />
          </div>
        </div>
      </SectionCard>

      {/* Tabs */}
      <SectionCard>
        <SectionLabel label="Tabs" />
        <Tabs defaultValue="overview">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="analytics">Analytics</TabsTrigger>
            <TabsTrigger value="settings">Settings</TabsTrigger>
          </TabsList>
          <TabsContent value="overview" className="mt-4">
            <p style={{ color: "var(--text-secondary)" }} className="text-sm">
              Overview tab — discover trending niches before anyone else.
            </p>
          </TabsContent>
          <TabsContent value="analytics" className="mt-4">
            <p style={{ color: "var(--text-secondary)" }} className="text-sm">
              Analytics tab — velocity trends, view counts, engagement rates.
            </p>
          </TabsContent>
          <TabsContent value="settings" className="mt-4">
            <p style={{ color: "var(--text-secondary)" }} className="text-sm">
              Settings tab — configure niche filters and production preferences.
            </p>
          </TabsContent>
        </Tabs>
      </SectionCard>

      {/* Accordion */}
      <SectionCard>
        <SectionLabel label="Accordion" />
        <Accordion>
          <AccordionItem value="item-1">
            <AccordionTrigger>What is a velocity score?</AccordionTrigger>
            <AccordionContent>
              Velocity measures the week-over-week growth rate of views across
              the top-performing videos in a niche.
            </AccordionContent>
          </AccordionItem>
          <AccordionItem value="item-2">
            <AccordionTrigger>How is production fit calculated?</AccordionTrigger>
            <AccordionContent>
              Production fit combines average video length, required equipment,
              and faceless-format suitability into a High / Medium / Low score.
            </AccordionContent>
          </AccordionItem>
          <AccordionItem value="item-3">
            <AccordionTrigger>What does "proven band" mean?</AccordionTrigger>
            <AccordionContent>
              Proven indicates a niche with consistent 1k+ view patterns. First
              mover means a niche is accelerating but not yet crowded.
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </SectionCard>

      {/* Overlays */}
      <SectionCard>
        <SectionLabel label="Overlays" />
        <div className="flex flex-wrap items-center gap-3">
          {/* Dialog */}
          <Dialog>
            <DialogTrigger render={<Button variant="outline" />}>
              Open Dialog
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Confirm action</DialogTitle>
                <DialogDescription>
                  This will archive the selected niche from your workspace.
                  You can recover it from Settings at any time.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter showCloseButton>
                <Button
                  variant="destructive"
                  onClick={() => toast.error("Niche archived")}
                >
                  Archive
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Sheet */}
          <Sheet>
            <SheetTrigger render={<Button variant="outline" />}>
              Open Sheet
            </SheetTrigger>
            <SheetContent>
              <SheetHeader>
                <SheetTitle>Niche details</SheetTitle>
                <SheetDescription>
                  Full analysis, sparkline history, and suggested scripts.
                </SheetDescription>
              </SheetHeader>
              <div className="px-4 py-2">
                <p
                  className="text-sm"
                  style={{ color: "var(--text-secondary)" }}
                >
                  Sheet content goes here — this area will contain the full
                  niche deep-dive in production.
                </p>
              </div>
            </SheetContent>
          </Sheet>

          {/* Popover */}
          <Popover>
            <PopoverTrigger render={<Button variant="outline" />}>
              Open Popover
            </PopoverTrigger>
            <PopoverContent>
              <PopoverHeader>
                <PopoverTitle>Quick filters</PopoverTitle>
                <PopoverDescription>
                  Narrow results by production fit and discovery state.
                </PopoverDescription>
              </PopoverHeader>
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Switch id="sb-pop-switch" />
                  <Label htmlFor="sb-pop-switch">High fit only</Label>
                </div>
              </div>
            </PopoverContent>
          </Popover>

          {/* Tooltip */}
          <Tooltip>
            <TooltipTrigger
              render={<Button variant="outline" />}
            >
              Hover for Tooltip
            </TooltipTrigger>
            <TooltipContent>
              Velocity is recalculated every 6 hours from live YouTube data.
            </TooltipContent>
          </Tooltip>

          {/* Dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button variant="outline" />}>
              Dropdown Menu
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuLabel>Actions</DropdownMenuLabel>
              <DropdownMenuItem onClick={() => toast.success("Copied!")}>
                <Copy className="mr-2 h-4 w-4" strokeWidth={1.5} />
                Copy link
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => toast.success("Downloading…")}>
                <Download className="mr-2 h-4 w-4" strokeWidth={1.5} />
                Export CSV
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant="destructive"
                onClick={() => toast.error("Deleted")}
              >
                <Trash2 className="mr-2 h-4 w-4" strokeWidth={1.5} />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </SectionCard>

      {/* Display components */}
      <SectionCard>
        <SectionLabel label="Avatar / Badge / Progress / Separator" />
        <div className="space-y-6">
          {/* Avatars */}
          <div className="flex items-center gap-3">
            <Avatar>
              <AvatarImage src="https://github.com/shadcn.png" alt="User" />
              <AvatarFallback>SD</AvatarFallback>
            </Avatar>
            <Avatar>
              <AvatarFallback>AB</AvatarFallback>
            </Avatar>
            <Avatar size="lg">
              <AvatarFallback>LG</AvatarFallback>
            </Avatar>
            <Avatar size="sm">
              <AvatarFallback>SM</AvatarFallback>
            </Avatar>
          </div>

          {/* Badges */}
          <div className="flex flex-wrap gap-2">
            <Badge>Default</Badge>
            <Badge variant="secondary">Secondary</Badge>
            <Badge variant="outline">Outline</Badge>
            <Badge variant="destructive">Destructive</Badge>
          </div>

          {/* Progress bars */}
          <div className="space-y-3 max-w-sm">
            <Progress value={72} />
            <Progress value={45} />
            <Progress value={100} />
          </div>

          <Separator />

          {/* Skeleton card */}
          <div
            className="rounded-xl border p-4 max-w-xs space-y-3"
            style={{
              background: "var(--surface-2)",
              borderColor: "var(--border-subtle)",
            }}
          >
            <p
              className="mb-2 font-mono text-[10px] uppercase tracking-widest"
              style={{ color: "var(--text-tertiary)" }}
            >
              Skeleton — loading state
            </p>
            <div className="flex items-center gap-3">
              <Skeleton className="h-10 w-10 rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-3 w-3/4 rounded" />
                <Skeleton className="h-3 w-1/2 rounded" />
              </div>
            </div>
            <Skeleton className="h-3 w-full rounded" />
            <Skeleton className="h-3 w-5/6 rounded" />
            <Skeleton className="h-6 w-20 rounded" />
          </div>
        </div>
      </SectionCard>

      {/* ScrollArea + Calendar side by side */}
      <SectionCard>
        <SectionLabel label="ScrollArea + Calendar" />
        <div className="flex flex-wrap gap-6">
          <ScrollArea
            className="h-48 w-56 rounded-lg border"
            style={{ borderColor: "var(--border-subtle)" }}
          >
            <div className="p-3 space-y-2">
              {Array.from({ length: 20 }, (_, i) => (
                <p
                  key={i}
                  className="text-sm"
                  style={{ color: "var(--text-secondary)" }}
                >
                  Scroll item {i + 1} — niche idea placeholder
                </p>
              ))}
            </div>
          </ScrollArea>

          <Calendar
            mode="single"
            selected={calDate}
            onSelect={setCalDate}
          />
        </div>
      </SectionCard>

      {/* DataTable */}
      <SectionCard>
        <SectionLabel label="DataTable — with data" />
        <DataTable columns={NICHE_COLUMNS} data={NICHE_ROWS} />
      </SectionCard>

      <SectionCard>
        <SectionLabel label="DataTable — empty state" />
        <DataTable columns={NICHE_COLUMNS} data={[]} />
      </SectionCard>

      {/* Toast trigger */}
      <SectionCard>
        <SectionLabel label="Sonner toast" />
        <Button
          onClick={() => toast.success("Niche saved to your library")}
          variant="default"
        >
          Show toast
        </Button>
      </SectionCard>
    </section>
  )
}

// ─────────────────────────────────────────────
// Section 3: Motion
// ─────────────────────────────────────────────
function MotionSection() {
  const [pageTransitionKey, setPageTransitionKey] = useState(0)
  const [modalOpen, setModalOpen] = useState(false)

  return (
    <section className="space-y-8">
      <PageHeader
        title="Motion"
        description="All motion primitives — respects prefers-reduced-motion."
      />

      {/* PageTransition replay */}
      <SectionCard>
        <SectionLabel label="PageTransition — entry animation" />
        <div className="flex items-start gap-4">
          <PageTransition key={pageTransitionKey}>
            <div
              className="rounded-xl border p-6 max-w-xs"
              style={{
                background: "var(--surface-2)",
                borderColor: "var(--border-subtle)",
              }}
            >
              <p
                className="text-sm font-medium"
                style={{ color: "var(--text-primary)" }}
              >
                Page transition card
              </p>
              <p
                className="mt-1 text-xs"
                style={{ color: "var(--text-secondary)" }}
              >
                Fades up on mount. Click Replay to re-fire the entry animation.
              </p>
            </div>
          </PageTransition>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPageTransitionKey((k) => k + 1)}
          >
            <RefreshCw className="mr-1.5 h-3.5 w-3.5" strokeWidth={1.5} />
            Replay
          </Button>
        </div>
      </SectionCard>

      {/* HoverLift */}
      <SectionCard>
        <SectionLabel label="HoverLift — hover to lift" />
        <div className="flex flex-wrap gap-4">
          {["Niche A", "Niche B", "Niche C"].map((label) => (
            <HoverLift key={label}>
              <div
                className="cursor-pointer rounded-xl border p-5 w-40 text-center"
                style={{
                  background: "var(--surface-2)",
                  borderColor: "var(--border-subtle)",
                }}
              >
                <p
                  className="text-sm font-medium"
                  style={{ color: "var(--text-primary)" }}
                >
                  {label}
                </p>
                <p
                  className="mt-1 text-xs"
                  style={{ color: "var(--text-tertiary)" }}
                >
                  hover me
                </p>
              </div>
            </HoverLift>
          ))}
        </div>
      </SectionCard>

      {/* Tappable */}
      <SectionCard>
        <SectionLabel label="Tappable — press to scale + toast" />
        <Tappable
          className="inline-block cursor-pointer"
          onClick={() => toast.success("Tappable pressed!")}
        >
          <div
            className="rounded-xl border p-5 max-w-xs"
            style={{
              background: "var(--surface-2)",
              borderColor: "var(--border-subtle)",
            }}
          >
            <p
              className="text-sm font-medium"
              style={{ color: "var(--text-primary)" }}
            >
              Tap / click me
            </p>
            <p
              className="mt-1 text-xs"
              style={{ color: "var(--text-secondary)" }}
            >
              Scales down on press, fires a toast on release.
            </p>
          </div>
        </Tappable>
      </SectionCard>

      {/* ModalMotion */}
      <SectionCard>
        <SectionLabel label="ModalMotion — animated backdrop + content" />
        <Button
          variant="outline"
          onClick={() => setModalOpen(true)}
        >
          Open ModalMotion
        </Button>
        <AnimatePresence>
          {modalOpen && (
            <ModalMotion
              onBackdropClick={() => setModalOpen(false)}
              className="fixed inset-0 z-50 flex items-center justify-center"
            >
              <div
                className="rounded-2xl border p-6 w-full max-w-sm shadow-2xl"
                style={{
                  background: "var(--surface-overlay)",
                  borderColor: "var(--border-subtle)",
                }}
              >
                <p
                  className="text-base font-semibold"
                  style={{ color: "var(--text-primary)" }}
                >
                  Animated modal
                </p>
                <p
                  className="mt-2 text-sm"
                  style={{ color: "var(--text-secondary)" }}
                >
                  Backdrop fades, card scales in. Click the backdrop or close
                  to animate out via AnimatePresence.
                </p>
                <div className="mt-4 flex justify-end">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setModalOpen(false)}
                  >
                    Close
                  </Button>
                </div>
              </div>
            </ModalMotion>
          )}
        </AnimatePresence>
      </SectionCard>

      {/* Reduced-motion note */}
      <p
        className="text-sm italic"
        style={{ color: "var(--text-tertiary)" }}
      >
        Respects prefers-reduced-motion — all of the above collapse to static
        when reduced motion is on.
      </p>
    </section>
  )
}

// ─────────────────────────────────────────────
// Section 4: Compositions
// ─────────────────────────────────────────────
function CompositionsSection() {
  const [suggestionStatuses, setSuggestionStatuses] = useState<
    SuggestionStatus[]
  >(["open", "accepted", "ignored"])

  const handleAccept = (i: number) =>
    setSuggestionStatuses((s) => {
      const next = [...s]
      next[i] = "accepted"
      return next
    })

  const handleIgnore = (i: number) =>
    setSuggestionStatuses((s) => {
      const next = [...s]
      next[i] = "ignored"
      return next
    })

  const reviewDimensions: ReviewDimension[] = [
    {
      key: "hook",
      label: "Hook strength",
      verdict: "pass",
      note: "Opens with a compelling visual question.",
    },
    {
      key: "pacing",
      label: "Pacing",
      verdict: "warn",
      note: "Cut 4s dead air at 0:32.",
    },
    {
      key: "retention",
      label: "Predicted retention",
      verdict: "warn",
      note: "Below 40% at the 1-min mark — tighten middle.",
    },
    {
      key: "cta",
      label: "CTA clarity",
      verdict: "fail",
      note: "No explicit subscribe prompt in final 5s.",
    },
  ]

  return (
    <section className="space-y-8">
      <PageHeader
        title="Compositions"
        description="Product-specific compound components built on the token layer."
      />

      {/* NicheCards */}
      <SectionCard>
        <SectionLabel label="NicheCard × 3 variants" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {/* Full / validated / high / proven */}
          <NicheCard
            title="Budget travel vlogs"
            summary="Hyper-specific cost-breakdown format exploding on Shorts. Audience skews 18–28, high rewatch rate."
            velocityValues={[3, 5, 4, 8, 11, 16, 20]}
            velocityLabel="+18%/wk"
            outlierMultiplier={6.2}
            discoveryState="validated"
            productionFit="high"
            provenBand="proven"
            onOpen={() => toast.success("Opened: Budget travel vlogs")}
          />
          {/* Emerging / first_mover / medium */}
          <NicheCard
            title="Quiet productivity setups"
            summary="Aesthetic desk-tour format gaining traction in the minimalist community."
            velocityValues={[10, 9, 11, 8, 7, 5, 4]}
            velocityLabel="+2.8%/wk"
            outlierMultiplier={2.8}
            discoveryState="emerging"
            productionFit="medium"
            provenBand="first_mover"
            onOpen={() => toast.success("Opened: Quiet productivity")}
          />
          {/* Minimal / saturated / low / no outlier / no onOpen */}
          <NicheCard
            title="Prank compilations"
            velocityValues={[6, 5, 5, 6, 5, 5, 4]}
            discoveryState="saturated"
            productionFit="low"
          />
        </div>
      </SectionCard>

      {/* AssistantCards */}
      <SectionCard>
        <SectionLabel label="AssistantCard — idle / working / errored / disabled" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <AssistantCard
            icon={Compass}
            name="Niche Scout"
            role="Discovers trending niches from YouTube data"
            status="idle"
            activitySummary="Last scan: 3 new validated niches"
            recentActivity={[
              { id: "1", summary: "Budget travel vlogs → validated", at: "2h ago" },
              { id: "2", summary: "Retro gaming reviews → emerging", at: "4h ago" },
              { id: "3", summary: "One-pan recipes → proven", at: "6h ago" },
            ]}
            onOpen={() => toast.success("Opened: Niche Scout")}
          />
          <AssistantCard
            icon={Sparkles}
            name="Script Writer"
            role="Generates narration scripts from niche briefs"
            status="working"
            activitySummary="Writing script for Budget travel vlogs…"
            onOpen={() => toast.success("Opened: Script Writer")}
          />
          <AssistantCard
            icon={Film}
            name="Video Packager"
            role="Assembles B-roll, captions, and exports"
            status="errored"
            activitySummary="Export failed — missing B-roll clip"
            onOpen={() => toast.success("Opened: Video Packager")}
          />
          <AssistantCard
            icon={Wand2}
            name="Editor Co-pilot"
            role="Premiere Pro + CapCut editing assistant"
            status="idle"
            activitySummary="Waiting for Phase 3"
            disabled
            comingInPhase={3}
          />
        </div>
      </SectionCard>

      {/* MissionControlGrid */}
      <SectionCard>
        <SectionLabel label="MissionControlGrid — 6 cards in 1/2/3 col grid" />
        <MissionControlGrid>
          <AssistantCard
            icon={Compass}
            name="Niche Scout"
            role="Trend discovery"
            status="idle"
            activitySummary="Ready"
          />
          <AssistantCard
            icon={Sparkles}
            name="Script Writer"
            role="Narration scripts"
            status="working"
            activitySummary="Drafting…"
          />
          <AssistantCard
            icon={Film}
            name="Video Packager"
            role="B-roll + export"
            status="errored"
            activitySummary="Needs attention"
          />
          <AssistantCard
            icon={Search}
            name="Keyword Analyst"
            role="SEO + tag optimization"
            status="idle"
            activitySummary="Last run: 12h ago"
          />
          <AssistantCard
            icon={Telescope}
            name="Trend Radar"
            role="Cross-platform signals"
            status="idle"
            activitySummary="Monitoring 4 platforms"
          />
          <AssistantCard
            icon={BookOpen}
            name="Compliance Check"
            role="Monetization & policy QC"
            status="idle"
            activitySummary="All clear"
            disabled
            comingInPhase={4}
          />
        </MissionControlGrid>
      </SectionCard>

      {/* ReviewScorecard */}
      <SectionCard>
        <SectionLabel label="ReviewScorecard + ReviewSuggestionItems" />
        <div className="grid gap-6 lg:grid-cols-2">
          <ReviewScorecard
            overallVerdict="warn"
            overallScore={78}
            dimensions={reviewDimensions}
          />
          <div className="space-y-3">
            {[
              "Add a clear subscribe CTA in the final 5 seconds.",
              "Tighten the mid-section — cut 4s dead air at 0:32.",
              "Open with the hook visual before any narration.",
            ].map((text, i) => (
              <ReviewSuggestionItem
                key={i}
                index={i}
                text={text}
                status={suggestionStatuses[i]}
                onAccept={handleAccept}
                onIgnore={handleIgnore}
              />
            ))}
          </div>
        </div>
      </SectionCard>

      {/* Badges row */}
      <SectionCard>
        <SectionLabel label="Badges + StatusDot + ShortcutHint" />
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex flex-wrap gap-2 items-center">
            <DiscoveryStateBadge state="discovered" />
            <DiscoveryStateBadge state="emerging" />
            <DiscoveryStateBadge state="validated" />
            <DiscoveryStateBadge state="saturated" />
          </div>
          <Separator orientation="vertical" className="h-5" />
          <div className="flex flex-wrap gap-2 items-center">
            <ProductionFitBadge fit="high" />
            <ProductionFitBadge fit="medium" />
            <ProductionFitBadge fit="low" />
          </div>
          <Separator orientation="vertical" className="h-5" />
          <div className="flex flex-wrap gap-2 items-center">
            <ProvenBandBadge band="proven" />
            <ProvenBandBadge band="first_mover" />
            <ProvenBandBadge band="mixed" />
          </div>
          <Separator orientation="vertical" className="h-5" />
          <div className="flex flex-wrap gap-2 items-center">
            {/* multiplier <1.5 renders null by design */}
            <OutlierBadge multiplier={1.2} />
            <OutlierBadge multiplier={1.8} />
            <OutlierBadge multiplier={3.2} />
            <OutlierBadge multiplier={6.5} />
          </div>
          <Separator orientation="vertical" className="h-5" />
          <div className="flex flex-wrap gap-3 items-center">
            <AssistantStatusDot status="idle" label="Idle" />
            <AssistantStatusDot status="working" label="Working" />
            <AssistantStatusDot status="waiting" label="Waiting" />
            <AssistantStatusDot status="errored" label="Errored" />
          </div>
          <Separator orientation="vertical" className="h-5" />
          <div className="flex items-center gap-2">
            <span
              className="text-xs"
              style={{ color: "var(--text-secondary)" }}
            >
              Command palette
            </span>
            <KeyboardShortcutHint keys={["⌘", "K"]} />
          </div>
        </div>
      </SectionCard>

      {/* Sparklines */}
      <SectionCard>
        <SectionLabel label="VelocitySparkline — up / down / flat" />
        <div className="flex flex-wrap gap-8">
          {[
            { label: "Trending up", values: [2, 4, 3, 6, 8, 12] },
            { label: "Trending down", values: [12, 9, 10, 6, 4, 2] },
            { label: "Flat", values: [5, 5, 6, 5, 5, 5] },
          ].map(({ label, values }) => (
            <div key={label} className="flex flex-col items-start gap-2">
              <VelocitySparkline
                values={values}
                width={96}
                height={32}
                showArea
              />
              <p
                className="font-mono text-[10px]"
                style={{ color: "var(--text-tertiary)" }}
              >
                {label}
              </p>
            </div>
          ))}
        </div>
      </SectionCard>

      {/* EmptyState */}
      <SectionCard>
        <SectionLabel label="EmptyState" />
        <EmptyState
          icon={Info}
          title="No niches found"
          description="Try adjusting your filters or broadening your search to discover more niche opportunities."
          action={{
            label: "Reset filters",
            onClick: () => toast.success("Filters reset"),
          }}
        />
      </SectionCard>
    </section>
  )
}

// ─────────────────────────────────────────────
// Section 5: Command Palette
// ─────────────────────────────────────────────
function CommandPaletteSection() {
  const { open, setOpen, toggle } = useCommandPalette()

  const groups: CommandPaletteGroup[] = [
    {
      heading: "Navigation",
      items: [
        {
          id: "go-discover",
          label: "Go to Discover",
          icon: Compass,
          shortcut: ["G", "D"],
          onSelect: () => toast.success("Navigating to Discover"),
        },
        {
          id: "go-niches",
          label: "Go to Niches",
          icon: Sparkles,
          shortcut: ["G", "N"],
          onSelect: () => toast.success("Navigating to Niches"),
        },
        {
          id: "go-videos",
          label: "Go to Videos",
          icon: Film,
          shortcut: ["G", "V"],
          onSelect: () => toast.success("Navigating to Videos"),
        },
      ],
    },
    {
      heading: "Actions",
      items: [
        {
          id: "new-niche",
          label: "Create new niche brief",
          icon: PlusCircle,
          shortcut: ["⌘", "N"],
          onSelect: () => toast.success("Creating niche brief…"),
        },
        {
          id: "run-scout",
          label: "Run Niche Scout now",
          icon: Search,
          onSelect: () => toast.success("Niche Scout started"),
        },
        {
          id: "open-settings",
          label: "Open settings",
          icon: Settings,
          shortcut: ["⌘", ","],
          onSelect: () => toast.success("Opening settings"),
        },
      ],
    },
  ]

  return (
    <section className="space-y-8">
      <PageHeader
        title="Command Palette"
        description="Global Cmd+K command palette. Try it from anywhere in the page."
      />

      <SectionCard>
        <SectionLabel label="Trigger + global shortcut" />
        <div className="flex items-center gap-3">
          <Button variant="outline" onClick={toggle}>
            Open command palette
          </Button>
          <KeyboardShortcutHint keys={["⌘", "K"]} />
          <span
            className="text-sm"
            style={{ color: "var(--text-tertiary)" }}
          >
            — also works from anywhere on the page
          </span>
        </div>
        <p
          className="mt-3 text-sm"
          style={{ color: "var(--text-secondary)" }}
        >
          The palette is wired to the global <kbd className="font-mono text-xs">Cmd/Ctrl+K</kbd> listener via{" "}
          <code className="font-mono text-xs">useCommandPalette()</code>.
          Each item fires a sonner toast when selected.
        </p>
      </SectionCard>

      <CommandPalette open={open} onOpenChange={setOpen} groups={groups} />
    </section>
  )
}

// ─────────────────────────────────────────────
// Root client component
// ─────────────────────────────────────────────
export function SandboxClient() {
  return (
    <AppShell
      sidebar={
        <Sidebar
          items={NAV_ITEMS}
          activeHref="#"
          footer={<ThemeToggle />}
        />
      }
    >
      <div className="space-y-20 pb-20">
        <TokensSection />
        <PrimitivesSection />
        <MotionSection />
        <CompositionsSection />
        <CommandPaletteSection />
      </div>
    </AppShell>
  )
}
