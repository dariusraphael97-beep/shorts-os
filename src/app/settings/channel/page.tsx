import { AppShell } from '@/components/layout/app-shell';
import { AppSidebar } from '@/components/layout/app-sidebar';
import { PageHeader } from '@/components/layout/page-header';
import { getServiceClient } from '@/lib/supabase/server';
import { getDefaultChannel, isYouTubeConnected } from '@/lib/supabase/repositories/channels';
import { ChannelSettingsClient } from './channel-settings-client';

export const dynamic = 'force-dynamic';

export default async function SettingsChannelPage({
  searchParams,
}: {
  searchParams: Promise<{ connected?: string; error?: string }>;
}) {
  const { connected, error } = await searchParams;
  const supabase = getServiceClient();
  const channel = await getDefaultChannel(supabase);
  const ytConnected = await isYouTubeConnected(supabase, channel.id);

  return (
    <AppShell bare sidebar={<AppSidebar />}>
      <div className="mx-auto max-w-[1080px] px-8 py-8">
        <PageHeader
          title="Channel settings"
          description="Connect YouTube and review the active channel used for publishing."
        />
        <ChannelSettingsClient
          view={{
            displayName: channel.display_name,
            slug: channel.slug,
            platform: channel.platform,
            externalChannelId: channel.external_channel_id ?? null,
            ytConnected,
            connectedBanner: connected === 'true',
            errorBanner: error ?? null,
          }}
        />
      </div>
    </AppShell>
  );
}
