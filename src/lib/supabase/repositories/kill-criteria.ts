import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';

export type KillVerdict = 'pass' | 'fail' | 'inconclusive';

export interface KillCriteriaEvaluation {
  id: string;
  evaluated_at: string;
  criterion: string;
  verdict: KillVerdict;
  evidence: Record<string, unknown>;
  decision_text: string;
}

export interface RecordKillCriteriaParams {
  criterion: string;
  verdict: KillVerdict;
  evidence: Record<string, unknown>;
  decisionText: string;
}

export async function recordKillCriteriaEvaluation(
  supabase: SupabaseClient,
  params: RecordKillCriteriaParams,
): Promise<KillCriteriaEvaluation> {
  const { data, error } = await supabase
    .from('kill_criteria_log')
    .insert({
      criterion: params.criterion,
      verdict: params.verdict,
      evidence: params.evidence,
      decision_text: params.decisionText,
    })
    .select()
    .single();
  if (error) throw new Error(`recordKillCriteriaEvaluation: ${error.message}`);
  return data as KillCriteriaEvaluation;
}

export async function listKillCriteriaEvaluations(
  supabase: SupabaseClient,
): Promise<KillCriteriaEvaluation[]> {
  const { data, error } = await supabase
    .from('kill_criteria_log')
    .select()
    .order('evaluated_at', { ascending: false });
  if (error) throw new Error(`listKillCriteriaEvaluations: ${error.message}`);
  return (data ?? []) as KillCriteriaEvaluation[];
}
