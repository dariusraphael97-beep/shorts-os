import { AppShell } from '@/components/layout/app-shell';
import { AppSidebar } from '@/components/layout/app-sidebar';
import { getServiceClient } from '@/lib/supabase/server';
import { getDefaultChannel, isYouTubeConnected } from '@/lib/supabase/repositories/channels';
import { ConnectYouTubeButton } from '@/components/settings/connect-youtube-button';

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
      <div className="p-6 space-y-6 max-w-2xl mx-auto">
        <header>
          <h1 className="text-2xl font-semibold text-text-primary">Channel settings</h1>
          <p className="text-text-secondary text-sm mt-1">Connect YouTube + view channel state.</p>
        </header>

        {connected === 'true' && (
          <div className="rounded border border-accent-electric/40 bg-accent-electric/10 px-4 py-3 text-sm text-text-primary">
            ✓ YouTube connected. Upload jobs will now use this account.
          </div>
        )}
        {error && (
          <div className="rounded border border-accent-red/40 bg-accent-red/10 px-4 py-3 text-sm text-text-primary">
            ✗ OAuth failed: {error}
          </div>
        )}

        <section className="rounded-lg border border-subtle bg-surface p-4 space-y-3">
          <h2 className="text-sm font-medium text-text-primary">{channel.display_name}</h2>
          <dl className="text-xs font-mono text-text-muted space-y-1">
            <div><dt className="inline">slug:</dt> <dd className="inline">{channel.slug}</dd></div>
            <div><dt className="inline">platform:</dt> <dd className="inline">{channel.platform}</dd></div>
            <div><dt className="inline">external_channel_id:</dt> <dd className="inline">{channel.external_channel_id ?? '(not set)'}</dd></div>
            <div>
              <dt className="inline">YouTube OAuth:</dt>{' '}
              <dd className="inline">{ytConnected ? 'connected' : 'not connected'}</dd>
            </div>
          </dl>
          <ConnectYouTubeButton connected={ytConnected} />
        </section>
      </div>
    </AppShell>
  );
}
