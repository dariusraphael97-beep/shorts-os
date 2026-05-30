import "server-only";
import { buildEmailProps, type DigestClusterRow } from "@/lib/digest/build-email-props";
import { predictionInterval } from "@/lib/digest/prediction-interval";

type ClusterRow = DigestClusterRow & { avg_velocity_24h: number | null };

export interface DigestSendDeps {
  weekStart: string;
  recipient: string | null;
  canSend: boolean;
  fetchClusters: () => Promise<ClusterRow[]>;
  renderHtml: (props: ReturnType<typeof buildEmailProps>) => Promise<{ html: string; text: string }>;
  send: (args: { to: string; html: string; text: string; subject: string }) => Promise<{ id: string }>;
  insertDigestRun: (r: {
    weekStart: string;
    recipient: string | null;
    status: "sent" | "skipped" | "failed";
    clusterIds: string[];
    html: string | null;
    error?: string | null;
  }) => Promise<void>;
  insertPrediction: (p: {
    nicheClusterId: string;
    predictedViews7dLower: number;
    predictedViews7dUpper: number;
  }) => Promise<void>;
}

export interface DigestSendResult { status: "sent" | "skipped" | "failed"; clusterCount: number }

export async function runDigestSend(deps: DigestSendDeps): Promise<DigestSendResult> {
  const clusters = await deps.fetchClusters();
  const clusterIds = clusters.map((c) => c.id);
  if (clusters.length === 0) {
    await deps.insertDigestRun({ weekStart: deps.weekStart, recipient: deps.recipient, status: "skipped", clusterIds: [], html: null });
    return { status: "skipped", clusterCount: 0 };
  }
  const props = buildEmailProps(deps.weekStart, clusters);
  const { html, text } = await deps.renderHtml(props);

  if (!deps.canSend || !deps.recipient) {
    await deps.insertDigestRun({ weekStart: deps.weekStart, recipient: deps.recipient, status: "skipped", clusterIds, html });
    return { status: "skipped", clusterCount: clusters.length };
  }

  try {
    await deps.send({ to: deps.recipient, html, text, subject: `This week's niches — ${deps.weekStart}` });
  } catch (e) {
    await deps.insertDigestRun({ weekStart: deps.weekStart, recipient: deps.recipient, status: "failed", clusterIds, html, error: e instanceof Error ? e.message : String(e) });
    return { status: "failed", clusterCount: clusters.length };
  }

  await deps.insertDigestRun({ weekStart: deps.weekStart, recipient: deps.recipient, status: "sent", clusterIds, html });
  // Sealed predictions: one per surfaced cluster (best-effort; a failure here doesn't unsend).
  for (const c of clusters) {
    const { lower, upper } = predictionInterval(c.avg_views, c.avg_velocity_24h);
    await deps.insertPrediction({ nicheClusterId: c.id, predictedViews7dLower: lower, predictedViews7dUpper: upper });
  }
  return { status: "sent", clusterCount: clusters.length };
}
