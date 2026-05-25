import { CockpitShell } from "@/components/cockpit/cockpit-shell";
import { TopicQueuePanel } from "@/components/cockpit/topic-queue-panel";

export default function HomePage() {
  return (
    <CockpitShell>
      <div className="h-full flex flex-col lg:flex-row">
        <div className="flex-1 min-w-0 lg:basis-3/5 lg:border-r lg:border-subtle">
          <TopicQueuePanel />
        </div>
        <div className="flex-1 min-w-0 lg:basis-2/5">
          {/* TrendingPanel mounts in Task 6.2 */}
          <div className="p-8 text-text-muted text-sm">Trending Panel — coming next task</div>
        </div>
      </div>
    </CockpitShell>
  );
}
