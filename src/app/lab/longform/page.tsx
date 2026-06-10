import { AppShell } from "@/components/layout/app-shell";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { getServiceClient } from "@/lib/supabase/server";
import { LongformComposer } from "@/components/lab/longform/longform-composer";
import { LongformRunPane } from "@/components/lab/longform/longform-run-pane";
import { LongformReview } from "@/components/lab/longform/longform-review";

export const dynamic = "force-dynamic";

export default async function LongformLabPage() {
  const supabase = getServiceClient();
  const { data: channel } = await supabase.from("channels").select("id").limit(1).maybeSingle();
  const { data: drafts } = await supabase
    .from("your_videos")
    .select("id, title, status, render_artifact_url, duration_seconds, longform_plan, chapter_markers, created_at")
    .eq("format", "longform")
    .order("created_at", { ascending: false })
    .limit(10);

  return (
    <AppShell bare sidebar={<AppSidebar />}>
      <div className="mx-auto max-w-4xl space-y-6 p-6">
        <header>
          <h1 className="text-2xl font-semibold text-text-primary">Longform</h1>
          <p className="mt-1 text-sm text-text-secondary">Type a topic → a finished 16:9 faceless documentary.</p>
        </header>
        {channel?.id ? <LongformComposer channelId={channel.id} /> : <p className="text-sm text-[var(--accent-red)]">No channel configured. Add one in Settings first.</p>}
        <LongformRunPane />
        <div className="space-y-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--text-muted)]">Recent longform drafts</h2>
          {(drafts ?? []).length === 0
            ? <p className="text-sm text-[var(--text-muted)]">No longform videos yet.</p>
            : (drafts ?? []).map((d) => <LongformReview key={d.id} draft={d} />)}
        </div>
      </div>
    </AppShell>
  );
}
