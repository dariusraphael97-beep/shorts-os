import type { SupabaseClient } from '@supabase/supabase-js';
import { updateAssistantStatus, recordAssistantActivity, type AssistantState } from '@/lib/supabase/repositories/assistants';

export async function reportAssistant(
  supabase: SupabaseClient,
  assistantId: string,
  state: AssistantState,
  activity: string | null,
  log?: { activityType: string; summary: string; payload?: unknown },
): Promise<void> {
  try {
    await updateAssistantStatus(supabase, assistantId, state, activity);
    if (log) await recordAssistantActivity(supabase, { assistantId, ...log });
  } catch (e) {
    console.error(`reportAssistant(${assistantId}) failed (non-fatal):`, e);
  }
}
