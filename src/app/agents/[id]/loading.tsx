import { AppShell } from "@/components/layout/app-shell";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { Skeleton } from "@/components/ui/skeleton";

export default function AgentLoading() {
  return (
    <AppShell sidebar={<AppSidebar activeHref="/mission-control" />}>
      <div className="mb-6 flex items-center gap-4">
        <Skeleton className="h-12 w-12 rounded-xl" />
        <div className="space-y-2">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-64" />
        </div>
      </div>
      <Skeleton className="mb-6 h-9 w-80" />
      <div className="space-y-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-8 w-full" />
        ))}
      </div>
    </AppShell>
  );
}
