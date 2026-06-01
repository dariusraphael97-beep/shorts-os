import { describe, it, expect } from "vitest";
import { aggregateHealth, type CronHealth, type AgentHealth } from "@/lib/admin/health";

const greenCron = (job: string): CronHealth => ({ job, level: "green", reason: "healthy" });
const amberCron = (job: string): CronHealth => ({ job, level: "amber", reason: "slightly stale" });
const redCron   = (job: string): CronHealth => ({ job, level: "red",   reason: "last run failed" });

const idleAgent  = (id: string): AgentHealth => ({ assistantId: id, state: "idle",    currentActivity: null });
const errorAgent = (id: string): AgentHealth => ({ assistantId: id, state: "errored", currentActivity: null });

describe("aggregateHealth", () => {
  it("all crons green + no errored agents → healthy", () => {
    const result = aggregateHealth({
      crons:  [greenCron("youtube_category_sweep"), greenCron("google_trends")],
      agents: [idleAgent("researcher")],
    });
    expect(result.pill.level).toBe("healthy");
  });

  it("one amber cron + no red/errored → attention", () => {
    const result = aggregateHealth({
      crons:  [greenCron("youtube_category_sweep"), amberCron("google_trends")],
      agents: [idleAgent("researcher")],
    });
    expect(result.pill.level).toBe("attention");
  });

  it("one errored agent + no red crons → attention", () => {
    const result = aggregateHealth({
      crons:  [greenCron("youtube_category_sweep")],
      agents: [errorAgent("researcher")],
    });
    expect(result.pill.level).toBe("attention");
  });

  it("one red cron → critical (regardless of agents)", () => {
    const result = aggregateHealth({
      crons:  [redCron("youtube_category_sweep"), greenCron("google_trends")],
      agents: [idleAgent("researcher")],
    });
    expect(result.pill.level).toBe("critical");
  });

  it("passes crons and agents through unchanged", () => {
    const crons  = [greenCron("google_trends")];
    const agents = [idleAgent("researcher")];
    const result = aggregateHealth({ crons, agents });
    expect(result.crons).toEqual(crons);
    expect(result.agents).toEqual(agents);
  });
});
