import type { ReactNode } from "react";
import { TopBar } from "./top-bar";

/**
 * Layout wrapper used by both / and /lab.
 * Sidebar and ticker get added in Phase 4 and 7 — for now this is just top bar + main slot.
 */
export function CockpitShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col">
      <TopBar />
      <div className="flex-1 flex">
        <aside id="cockpit-sidebar-slot" className="w-60 border-r border-subtle hidden lg:block">
          {/* TeamStatusSidebar mounts here in Task 4.1 */}
        </aside>
        <main className="flex-1 min-w-0">{children}</main>
      </div>
      <footer id="cockpit-ticker-slot" className="h-15 border-t border-subtle">
        {/* ScraperTickerFooter mounts here in Task 7.1 */}
      </footer>
    </div>
  );
}
