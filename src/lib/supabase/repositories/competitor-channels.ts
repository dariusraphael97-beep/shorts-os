import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';

export interface CompetitorChannel {
  channel_id: string;
  channel_handle: string | null;
  channel_title: string | null;
  added_at: string;
  is_active: boolean;
}

export interface AddCompetitorChannelParams {
  channelId: string;
  channelHandle?: string | null;
  channelTitle?: string | null;
}

export async function addCompetitorChannel(
  supabase: SupabaseClient,
  params: AddCompetitorChannelParams,
): Promise<CompetitorChannel> {
  const { data, error } = await supabase
    .from('competitor_channels')
    .upsert({
      channel_id: params.channelId,
      channel_handle: params.channelHandle ?? null,
      channel_title: params.channelTitle ?? null,
      is_active: true,
    })
    .select()
    .single();
  if (error) throw new Error(`addCompetitorChannel: ${error.message}`);
  return data as CompetitorChannel;
}

export async function listCompetitorChannels(
  supabase: SupabaseClient,
): Promise<CompetitorChannel[]> {
  const { data, error } = await supabase
    .from('competitor_channels')
    .select()
    .eq('is_active', true)
    .order('added_at', { ascending: false });
  if (error) throw new Error(`listCompetitorChannels: ${error.message}`);
  return (data ?? []) as CompetitorChannel[];
}
