import { deriveHealthPill, type HealthPill } from '@/lib/agents/dashboard/health';
import type { FreshnessLevel } from '@/lib/admin/freshness';

export interface CronHealth { job: string; level: FreshnessLevel; reason: string }
export interface AgentHealth { assistantId: string; state: string; currentActivity: string | null }
export interface AggregateHealthResult { pill: HealthPill; crons: CronHealth[]; agents: AgentHealth[] }

export function aggregateHealth(inputs: { crons: CronHealth[]; agents: AgentHealth[] }): AggregateHealthResult {
  const failedCrons = inputs.crons.filter((c) => c.level === 'red').map((c) => c.job);
  const staleCrons  = inputs.crons.filter((c) => c.level === 'amber').map((c) => c.job);
  const erroredAgents = inputs.agents.filter((a) => a.state === 'errored').map((a) => a.assistantId);
  const pill = deriveHealthPill({ erroredAgents, staleCrons, failedCrons });
  return { pill, crons: inputs.crons, agents: inputs.agents };
}
