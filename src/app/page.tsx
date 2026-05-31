import { redirect } from "next/navigation";
import { getServiceClient } from "@/lib/supabase/server";
import { getDefaultChannel } from "@/lib/supabase/repositories/channels";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const supabase = getServiceClient();
  const channel = await getDefaultChannel(supabase);
  if (!channel.onboarding_completed_at) redirect("/onboarding");
  redirect("/niches");
}
