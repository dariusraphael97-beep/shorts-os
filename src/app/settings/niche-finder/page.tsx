export const dynamic = "force-dynamic";

import { AppShell } from "@/components/layout/app-shell";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { PageHeader } from "@/components/layout/page-header";
import { loadEnv } from "@/lib/env";
import {
  CLASSIFIER_TOPIC_MODEL,
  CLASSIFIER_FORMAT_MODEL,
  EMBEDDING_MODEL,
} from "@/lib/ai/models";
import { SettingsClient, type NicheFinderConfig } from "./settings-client";

export default async function NicheFinderSettingsPage() {
  const env = loadEnv();

  const config: NicheFinderConfig = {
    digestEnabled: !!env.RESEND_API_KEY,
    recipient: env.DIGEST_RECIPIENT ?? null,
    sendTime: "Mondays 12:00 UTC",
    topicModel: CLASSIFIER_TOPIC_MODEL,
    formatModel: CLASSIFIER_FORMAT_MODEL,
    embeddingModel: EMBEDDING_MODEL,
  };

  return (
    <AppShell sidebar={<AppSidebar activeHref="/settings/niche-finder" />}>
      <PageHeader
        title="Niche Finder settings"
        description="Digest delivery, the models behind classification, and weekly reruns."
      />
      <SettingsClient config={config} />
    </AppShell>
  );
}
