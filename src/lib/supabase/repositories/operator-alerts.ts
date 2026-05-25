// src/lib/supabase/repositories/operator-alerts.ts
//
// Repository for operator_alerts. Used by §2 format-mix escape clause, §5.5
// backlog-overflow guardrail, and (Plan #5) Analyst recommendations. The
// /operations page consumes listUnresolvedAlerts and shows them in a top banner.
import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';

export type AlertCategory = 'format_mix_drift' | 'schedule_backlog_overflow'
  | 'cost_spike' | 'oauth_token_revoked' | 'clip_ingest_zero_yield' | 'analyst_recommendation';
export type AlertSeverity = 'info' | 'warn' | 'error';
export type AlertStatus = 'unresolved' | 'acknowledged' | 'resolved' | 'dismissed';

export interface OperatorAlertRow {
  id: string;
  channel_id: string | null;
  category: AlertCategory;
  severity: AlertSeverity;
  message: string;
  suggested_actions: unknown;
  context: unknown;
  status: AlertStatus;
  acknowledged_at: string | null;
  resolved_at: string | null;
  created_at: string;
}

export interface CreateOperatorAlertParams {
  channelId: string;
  category: AlertCategory;
  severity?: AlertSeverity;
  message: string;
  suggestedActions?: Array<{ label: string; action_type: string; params?: Record<string, unknown> }>;
  context?: Record<string, unknown>;
}

export async function createOperatorAlert(
  supabase: SupabaseClient,
  params: CreateOperatorAlertParams,
): Promise<OperatorAlertRow> {
  const { data, error } = await supabase
    .from('operator_alerts')
    .insert({
      channel_id: params.channelId,
      category: params.category,
      severity: params.severity ?? 'info',
      message: params.message,
      suggested_actions: params.suggestedActions ?? null,
      context: params.context ?? null,
    })
    .select()
    .single();
  if (error) throw error;
  return data as OperatorAlertRow;
}

export async function listUnresolvedAlerts(
  supabase: SupabaseClient,
  args: { channelId: string },
): Promise<OperatorAlertRow[]> {
  const { data, error } = await supabase
    .from('operator_alerts')
    .select('*')
    .eq('channel_id', args.channelId)
    .in('status', ['unresolved', 'acknowledged'])
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as OperatorAlertRow[];
}
