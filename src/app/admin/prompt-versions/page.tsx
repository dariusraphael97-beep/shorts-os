import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { Info } from "lucide-react";
import { CLASSIFIER_PROMPT_VERSION } from "@/lib/ingestion/classify-observations";
import { CLASSIFIER_TOPIC_MODEL, CLASSIFIER_FORMAT_MODEL } from "@/lib/ai/models";
import { AdminSidebar } from "@/app/admin/_components/admin-sidebar";

export const dynamic = "force-dynamic";

const FACTS = [
  { label: "Prompt version", value: CLASSIFIER_PROMPT_VERSION },
  { label: "Topic model", value: CLASSIFIER_TOPIC_MODEL },
  { label: "Format model", value: CLASSIFIER_FORMAT_MODEL },
] as const;

export default function PromptVersionsPage() {
  return (
    <AppShell sidebar={<AdminSidebar activeHref="/admin/prompt-versions" />}>
      <PageHeader
        title="Prompt Versions"
        description="The classifier prompt config in production today. Versioned history + rollback aren't built yet."
      />

      <div className="space-y-6">
        {/* Read-only: the current classifier config */}
        <Card className="p-6 gap-0">
          <h2 className="mb-5 font-heading text-base font-medium text-[var(--text-primary)]">
            Active classifier config
          </h2>
          <dl className="divide-y divide-[var(--border-subtle)]">
            {FACTS.map(({ label, value }) => (
              <div
                key={label}
                className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0"
              >
                <dt className="text-sm text-[var(--text-secondary)]">{label}</dt>
                <dd className="rounded-md bg-[var(--surface-2)] px-2.5 py-1 font-mono text-sm tabular-nums text-[var(--text-primary)]">
                  {value}
                </dd>
              </div>
            ))}
          </dl>
        </Card>

        {/* Honest callout: not a fake feature */}
        <Card className="p-5 gap-0 bg-[var(--surface-1)]">
          <div className="flex gap-3">
            <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-[var(--surface-2)] text-[var(--text-tertiary)]">
              <Info className="size-4" />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-medium text-[var(--text-primary)]">
                Versioned history isn&apos;t captured yet
              </p>
              <p className="mt-1 text-sm text-[var(--text-secondary)]">
                Versioned history, per-version sampling accuracy, and rollback arrive once the
                classifier captures prompt versions. Today the classifier runs a single in-code
                prompt (version shown above).
              </p>
            </div>
          </div>
        </Card>
      </div>
    </AppShell>
  );
}
