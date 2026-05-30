import { CockpitShell } from "@/components/cockpit/cockpit-shell";
import { TopicQueuePanel } from "@/components/cockpit/topic-queue-panel";
import { TrendingPanel } from "@/components/cockpit/trending-panel";

export default function MissionControlPage() {
  return (
    <CockpitShell>
      <div className="h-full flex flex-col lg:flex-row">
        <div className="flex-1 min-w-0 lg:basis-3/5 lg:border-r lg:border-subtle">
          <TopicQueuePanel />
        </div>
        <div className="flex-1 min-w-0 lg:basis-2/5">
          <TrendingPanel />
        </div>
      </div>
    </CockpitShell>
  );
}
