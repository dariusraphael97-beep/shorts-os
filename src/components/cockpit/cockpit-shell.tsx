import type { ReactNode } from "react";
import { TopBar } from "./top-bar";
import { TeamStatusSidebar } from "./team-status-sidebar";
import { ScraperTickerFooter } from "./scraper-ticker-footer";
import { Spotlight } from "@/components/ui/spotlight";

/**
 * Layout wrapper used by both / and /lab.
 * Sidebar and ticker get added in Phase 4 and 7 — for now this is just top bar + main slot.
 */
export function CockpitShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col">
      <TopBar />
      <div className="flex-1 flex">
        <aside className="w-60 border-r border-subtle hidden lg:block overflow-y-auto">
          <TeamStatusSidebar />
        </aside>
        {/* Spotlight wraps main: gradient tracks mouse, inner content renders on top */}
        <Spotlight className="flex-1 min-w-0" fill="#00ff88">
          <main className="h-full">{children}</main>
        </Spotlight>
      </div>
      <footer className="border-t border-subtle">
        <ScraperTickerFooter />
      </footer>
    </div>
  );
}
