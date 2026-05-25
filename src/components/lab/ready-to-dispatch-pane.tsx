// src/components/lab/ready-to-dispatch-pane.tsx
//
// Server component. Loads reviewed topics from the DB at request time
// and renders a row per topic with a DispatchButton. The actual SSE
// stream lifecycle is owned by DispatchButton (client).

import { getServiceClient } from "@/lib/supabase/server";
import { listReviewedTopics } from "@/lib/supabase/repositories/topic-queue";
import { DispatchButton } from "./dispatch-button";
import Link from "next/link";

export async function ReadyToDispatchPane() {
  const supabase = getServiceClient();
  const topics = await listReviewedTopics(supabase, 20);

  if (topics.length === 0) {
    return (
      <section className="rounded-lg border border-subtle bg-surface p-6">
        <h2 className="text-lg font-semibold text-text-primary">Ready to Dispatch</h2>
        <p className="mt-2 text-sm text-text-secondary">
          No topics reviewed yet. Approve some in the{" "}
          <Link href="/" className="text-accent-electric hover:underline">
            Cockpit
          </Link>{" "}
          first.
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-lg border border-subtle bg-surface">
      <header className="flex items-center justify-between px-4 py-3 border-b border-subtle">
        <h2 className="text-lg font-semibold text-text-primary">Ready to Dispatch</h2>
        <span className="text-xs font-mono text-text-muted">{topics.length} reviewed</span>
      </header>
      <ul className="divide-y divide-subtle">
        {topics.map((t) => (
          <li key={t.id} className="flex items-center gap-4 px-4 py-3">
            <span className="font-mono text-lg text-accent-electric w-10 shrink-0">
              {t.hookability_score ?? "—"}
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-sm text-text-primary line-clamp-2">{t.title}</p>
              <p className="text-xs text-text-muted mt-0.5">
                {t.source} · {(t.summary ?? "").slice(0, 80)}
              </p>
            </div>
            <DispatchButton topicId={t.id} />
          </li>
        ))}
      </ul>
    </section>
  );
}
