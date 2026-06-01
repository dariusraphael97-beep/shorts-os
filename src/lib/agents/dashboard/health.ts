export type HealthLevel = 'healthy' | 'attention' | 'critical';
export interface HealthInputs { erroredAgents: string[]; staleCrons: string[]; failedCrons: string[] }
export interface HealthPill { level: HealthLevel; summary: string }

export function deriveHealthPill(i: HealthInputs): HealthPill {
  if (i.failedCrons.length > 0) {
    return { level: 'critical', summary: `${i.failedCrons.length} system error${i.failedCrons.length > 1 ? 's' : ''}` };
  }
  const attention = i.erroredAgents.length + i.staleCrons.length;
  if (attention > 0) {
    return { level: 'attention', summary: `${attention} need${attention > 1 ? '' : 's'} attention` };
  }
  return { level: 'healthy', summary: 'All systems healthy' };
}
