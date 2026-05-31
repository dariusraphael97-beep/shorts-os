import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { FormatLabel } from './shorts-classifications';

export interface VidiqAppearance {
  id: string;
  canonical_topic: string;
  format_label: FormatLabel;
  first_surfaced_by_shorts_os_at: string;
  first_surfaced_by_vidiq_at: string | null;
  first_surfaced_by_1of10_at: string | null;
  first_surfaced_by_exploding_topics_at: string | null;
  notes: string | null;
  created_at: string;
}

export interface InsertVidiqAppearanceParams {
  canonicalTopic: string;
  formatLabel: FormatLabel;
  firstSurfacedByShortsOsAt: Date;
  firstSurfacedByVidiqAt?: Date | null;
  firstSurfacedBy1of10At?: Date | null;
  firstSurfacedByExplodingTopicsAt?: Date | null;
  notes?: string | null;
}

export async function insertVidiqAppearance(
  supabase: SupabaseClient,
  params: InsertVidiqAppearanceParams,
): Promise<VidiqAppearance> {
  const { data, error } = await supabase
    .from('vidiq_appearances')
    .insert({
      canonical_topic: params.canonicalTopic,
      format_label: params.formatLabel,
      first_surfaced_by_shorts_os_at: params.firstSurfacedByShortsOsAt.toISOString(),
      first_surfaced_by_vidiq_at: params.firstSurfacedByVidiqAt?.toISOString() ?? null,
      first_surfaced_by_1of10_at: params.firstSurfacedBy1of10At?.toISOString() ?? null,
      first_surfaced_by_exploding_topics_at: params.firstSurfacedByExplodingTopicsAt?.toISOString() ?? null,
      notes: params.notes ?? null,
    })
    .select()
    .single();
  if (error) throw new Error(`insertVidiqAppearance: ${error.message}`);
  return data as VidiqAppearance;
}

export function computeLagDays(shortsOsAt: Date, externalAt: Date): number {
  const ms = externalAt.getTime() - shortsOsAt.getTime();
  return Math.round(ms / (1000 * 60 * 60 * 24));
}

export async function listVidiqAppearances(supabase: SupabaseClient): Promise<VidiqAppearance[]> {
  const { data, error } = await supabase
    .from('vidiq_appearances')
    .select()
    .order('first_surfaced_by_shorts_os_at', { ascending: false });
  if (error) throw new Error(`listVidiqAppearances: ${error.message}`);
  return (data ?? []) as VidiqAppearance[];
}
