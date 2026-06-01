import { describe, it, expect } from "vitest";
import type {
  Assistant,
  AssistantStatus,
  AssistantActivity,
} from "@/lib/supabase/repositories/assistants";
import { assembleDashboard } from "@/lib/agents/dashboard/load";

// --- fixtures ---

const ENABLED_ASSISTANT: Assistant = {
  id: "a1",
  display_name: "Niche Scout",
  role_description: "Finds trending niches",
  icon_name: "telescope",
  accent_color_var: "--color-violet",
  is_enabled: true,
  created_at: "2026-01-01T00:00:00Z",
};

const DISABLED_ASSISTANT: Assistant = {
  id: "a2",
  display_name: "Script Writer",
  role_description: "Writes scripts",
  icon_name: "pen",
  accent_color_var: "--color-blue",
  is_enabled: false,
  created_at: "2026-01-02T00:00:00Z",
};

const STATUS_FOR_A1: AssistantStatus = {
  assistant_id: "a1",
  state: "working",
  current_activity: "Scanning YouTube trends",
  updated_at: "2026-05-31T12:00:00Z",
};

function makeActivity(id: string, assistantId: string): AssistantActivity {
  return {
    id,
    assistant_id: assistantId,
    activity_type: "scan",
    summary: `Activity ${id}`,
    payload: {},
    created_at: "2026-05-31T11:00:00Z",
  };
}

const FOUR_ACTIVITIES_FOR_A1: AssistantActivity[] = [
  makeActivity("act1", "a1"),
  makeActivity("act2", "a1"),
  makeActivity("act3", "a1"),
  makeActivity("act4", "a1"),
];

// --- tests ---

describe("assembleDashboard", () => {
  it("returns one VM per assistant in input order", () => {
    const vms = assembleDashboard({
      assistants: [ENABLED_ASSISTANT, DISABLED_ASSISTANT],
      statuses: [STATUS_FOR_A1],
      recentByAssistant: { a1: FOUR_ACTIVITIES_FOR_A1 },
    });
    expect(vms).toHaveLength(2);
    expect(vms[0].id).toBe("a1");
    expect(vms[1].id).toBe("a2");
  });

  it("maps snake_case fields to camelCase", () => {
    const vms = assembleDashboard({
      assistants: [ENABLED_ASSISTANT],
      statuses: [STATUS_FOR_A1],
      recentByAssistant: { a1: [] },
    });
    const vm = vms[0];
    expect(vm.displayName).toBe("Niche Scout");
    expect(vm.roleDescription).toBe("Finds trending niches");
    expect(vm.iconName).toBe("telescope");
    expect(vm.accentColorVar).toBe("--color-violet");
    expect(vm.isEnabled).toBe(true);
  });

  it("enabled assistant carries state + currentActivity from matching status row", () => {
    const vms = assembleDashboard({
      assistants: [ENABLED_ASSISTANT],
      statuses: [STATUS_FOR_A1],
      recentByAssistant: { a1: FOUR_ACTIVITIES_FOR_A1 },
    });
    const vm = vms[0];
    expect(vm.state).toBe("working");
    expect(vm.currentActivity).toBe("Scanning YouTube trends");
  });

  it("enabled assistant recent is truncated to the first 3", () => {
    const vms = assembleDashboard({
      assistants: [ENABLED_ASSISTANT],
      statuses: [STATUS_FOR_A1],
      recentByAssistant: { a1: FOUR_ACTIVITIES_FOR_A1 },
    });
    expect(vms[0].recent).toHaveLength(3);
    expect(vms[0].recent[0].id).toBe("act1");
    expect(vms[0].recent[2].id).toBe("act3");
  });

  it("disabled assistant is forced to state:idle, null currentActivity, empty recent", () => {
    const vms = assembleDashboard({
      assistants: [ENABLED_ASSISTANT, DISABLED_ASSISTANT],
      statuses: [STATUS_FOR_A1, { assistant_id: "a2", state: "working", current_activity: "busy", updated_at: "" }],
      recentByAssistant: {
        a1: FOUR_ACTIVITIES_FOR_A1,
        a2: [makeActivity("act9", "a2")],
      },
    });
    const disabled = vms[1];
    expect(disabled.state).toBe("idle");
    expect(disabled.currentActivity).toBeNull();
    expect(disabled.recent).toEqual([]);
  });

  it("enabled assistant with NO status row defaults to idle / null", () => {
    const vms = assembleDashboard({
      assistants: [ENABLED_ASSISTANT],
      statuses: [],
      recentByAssistant: { a1: FOUR_ACTIVITIES_FOR_A1 },
    });
    const vm = vms[0];
    expect(vm.state).toBe("idle");
    expect(vm.currentActivity).toBeNull();
    // recent still populated
    expect(vm.recent).toHaveLength(3);
  });
});
