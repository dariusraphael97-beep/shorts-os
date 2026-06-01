import type {
  Assistant,
  AssistantState,
  AssistantStatus,
  AssistantActivity,
} from "@/lib/supabase/repositories/assistants";

export type { AssistantState };

export interface AgentCardVM {
  id: string;
  displayName: string;
  roleDescription: string;
  iconName: string;
  accentColorVar: string;
  isEnabled: boolean;
  state: AssistantState;
  currentActivity: string | null;
  recent: AssistantActivity[];
}

export function assembleDashboard(inputs: {
  assistants: Assistant[];
  statuses: AssistantStatus[];
  recentByAssistant: Record<string, AssistantActivity[]>;
}): AgentCardVM[] {
  const statusByAssistantId = new Map<string, AssistantStatus>(
    inputs.statuses.map((s) => [s.assistant_id, s]),
  );

  return inputs.assistants.map((a): AgentCardVM => {
    if (!a.is_enabled) {
      return {
        id: a.id,
        displayName: a.display_name,
        roleDescription: a.role_description,
        iconName: a.icon_name,
        accentColorVar: a.accent_color_var,
        isEnabled: false,
        state: "idle",
        currentActivity: null,
        recent: [],
      };
    }

    const status = statusByAssistantId.get(a.id);
    const allRecent = inputs.recentByAssistant[a.id] ?? [];

    return {
      id: a.id,
      displayName: a.display_name,
      roleDescription: a.role_description,
      iconName: a.icon_name,
      accentColorVar: a.accent_color_var,
      isEnabled: true,
      state: status?.state ?? "idle",
      currentActivity: status?.current_activity ?? null,
      recent: allRecent.slice(0, 3),
    };
  });
}
