import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';

export type AssistantState = 'idle' | 'working' | 'waiting' | 'errored';

export interface Assistant {
  id: string;
  display_name: string;
  role_description: string;
  icon_name: string;
  accent_color_var: string;
  is_enabled: boolean;
  created_at: string;
}

export interface AssistantStatus {
  assistant_id: string;
  state: AssistantState;
  current_activity: string | null;
  updated_at: string;
}

export interface AssistantMemory {
  id: string;
  assistant_id: string;
  memory_key: string;
  memory_value: unknown;
  confidence: number;
  last_updated_at: string;
  editable_by_user: boolean;
}

export interface RegisterAssistantParams {
  id: string;
  displayName: string;
  roleDescription: string;
  iconName: string;
  accentColorVar?: string;
  isEnabled?: boolean;
}

export async function registerAssistant(
  supabase: SupabaseClient,
  params: RegisterAssistantParams,
): Promise<Assistant> {
  const { data, error } = await supabase
    .from('assistants')
    .upsert({
      id: params.id,
      display_name: params.displayName,
      role_description: params.roleDescription,
      icon_name: params.iconName,
      accent_color_var: params.accentColorVar ?? '--accent',
      is_enabled: params.isEnabled ?? true,
    })
    .select()
    .single();
  if (error) throw new Error(`registerAssistant: ${error.message}`);
  return data as Assistant;
}

export async function listAssistants(supabase: SupabaseClient): Promise<Assistant[]> {
  const { data, error } = await supabase
    .from('assistants')
    .select()
    .order('id', { ascending: true });
  if (error) throw new Error(`listAssistants: ${error.message}`);
  return (data ?? []) as Assistant[];
}

export async function getAssistantById(
  supabase: SupabaseClient,
  id: string,
): Promise<Assistant | null> {
  const { data, error } = await supabase
    .from('assistants')
    .select()
    .eq('id', id)
    .maybeSingle();
  if (error && (error as { code?: string }).code !== 'PGRST116') {
    throw new Error(`getAssistantById: ${error.message}`);
  }
  return (data as Assistant | null) ?? null;
}

export async function updateAssistantStatus(
  supabase: SupabaseClient,
  assistantId: string,
  state: AssistantState,
  currentActivity: string | null,
): Promise<AssistantStatus> {
  const { data, error } = await supabase
    .from('assistant_status')
    .upsert({
      assistant_id: assistantId,
      state,
      current_activity: currentActivity,
      updated_at: new Date().toISOString(),
    })
    .select()
    .single();
  if (error) throw new Error(`updateAssistantStatus: ${error.message}`);
  return data as AssistantStatus;
}

export interface UpsertAssistantMemoryParams {
  assistantId: string;
  memoryKey: string;
  memoryValue: unknown;
  confidence?: number;
  editableByUser?: boolean;
}

export async function upsertAssistantMemory(
  supabase: SupabaseClient,
  params: UpsertAssistantMemoryParams,
): Promise<AssistantMemory> {
  const { data, error } = await supabase
    .from('assistant_memory')
    .upsert(
      {
        assistant_id: params.assistantId,
        memory_key: params.memoryKey,
        memory_value: params.memoryValue,
        confidence: params.confidence ?? 0.5,
        editable_by_user: params.editableByUser ?? true,
        last_updated_at: new Date().toISOString(),
      },
      { onConflict: 'assistant_id,memory_key' },
    )
    .select()
    .single();
  if (error) throw new Error(`upsertAssistantMemory: ${error.message}`);
  return data as AssistantMemory;
}

export async function listAssistantMemory(
  supabase: SupabaseClient,
  assistantId: string,
): Promise<AssistantMemory[]> {
  const { data, error } = await supabase
    .from('assistant_memory')
    .select()
    .eq('assistant_id', assistantId)
    .order('last_updated_at', { ascending: false });
  if (error) throw new Error(`listAssistantMemory: ${error.message}`);
  return (data ?? []) as AssistantMemory[];
}

export async function deleteAssistantMemory(
  supabase: SupabaseClient,
  assistantId: string,
  memoryKey: string,
): Promise<void> {
  const { error } = await supabase
    .from('assistant_memory')
    .delete()
    .eq('assistant_id', assistantId)
    .eq('memory_key', memoryKey);
  if (error) throw new Error(`deleteAssistantMemory: ${error.message}`);
}

export type AssistantSettings = Record<string, unknown>;

export async function getAssistantSettings(
  supabase: SupabaseClient,
  assistantId: string,
): Promise<AssistantSettings> {
  const { data, error } = await supabase
    .from('assistant_settings')
    .select('settings')
    .eq('assistant_id', assistantId)
    .maybeSingle();
  if (error && (error as { code?: string }).code !== 'PGRST116') {
    throw new Error(`getAssistantSettings: ${error.message}`);
  }
  return ((data as { settings: AssistantSettings } | null)?.settings ?? {}) as AssistantSettings;
}

/** Merge-patch: shallow-spreads `patch` over the existing settings jsonb. */
export async function updateAssistantSettings(
  supabase: SupabaseClient,
  assistantId: string,
  patch: AssistantSettings,
): Promise<AssistantSettings> {
  const existing = await getAssistantSettings(supabase, assistantId);
  const merged = { ...existing, ...patch };
  const { error } = await supabase
    .from('assistant_settings')
    .upsert({ assistant_id: assistantId, settings: merged, updated_at: new Date().toISOString() });
  if (error) throw new Error(`updateAssistantSettings: ${error.message}`);
  return merged;
}

export async function setAssistantEnabled(
  supabase: SupabaseClient,
  assistantId: string,
  isEnabled: boolean,
): Promise<void> {
  const { error } = await supabase
    .from('assistants')
    .update({ is_enabled: isEnabled })
    .eq('id', assistantId);
  if (error) throw new Error(`setAssistantEnabled: ${error.message}`);
}
