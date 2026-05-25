import { getServiceClient } from "@/lib/supabase/server";
import { listQueuedTopics } from "@/lib/supabase/repositories/topic-queue";
import { TopicQueueClient } from "./topic-queue-client";

export async function TopicQueuePanel() {
  const supabase = getServiceClient();
  const initial = await listQueuedTopics(supabase, 30);
  return <TopicQueueClient initial={initial} />;
}
