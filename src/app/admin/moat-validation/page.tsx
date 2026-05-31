import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ShieldCheck } from "lucide-react";
import { getServiceClient } from "@/lib/supabase/server";
import { AdminSidebar } from "@/app/admin/_components/admin-sidebar";
import {
  listVidiqAppearances,
  type VidiqAppearance,
} from "@/lib/supabase/repositories/vidiq-appearances";
import { averageLagDays, earliestExternalLagDays } from "@/lib/admin/moat";
import { LogForm } from "./log-form";

export const dynamic = "force-dynamic";

function fmtFormat(label: string): string {
  return label.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function fmtExternal(iso: string | null): string {
  return iso ? fmtDate(iso) : "—";
}

function LagCell({ row }: { row: VidiqAppearance }) {
  const lag = earliestExternalLagDays(row);
  if (lag === null) {
    return <span className="text-[var(--text-tertiary)]">no external yet</span>;
  }
  const ahead = lag >= 0;
  return (
    <span
      className={`tabular-nums font-medium ${
        ahead ? "text-[var(--success,#22c55e)]" : "text-[var(--warning,#f59e0b)]"
      }`}
    >
      {ahead ? `+${lag}` : lag} {Math.abs(lag) === 1 ? "day" : "days"}
    </span>
  );
}

export default async function MoatValidationPage() {
  const supabase = getServiceClient();
  const rows = await listVidiqAppearances(supabase);
  const avg = averageLagDays(rows);
  const measuredCount = rows.filter((r) => earliestExternalLagDays(r) !== null).length;

  return (
    <AppShell sidebar={<AdminSidebar activeHref="/admin/moat-validation" />}>
      <PageHeader
        title="Moat Validation"
        description="Track how far ahead Shorts OS surfaces a niche before external tools (VidIQ / 1of10 / Exploding Topics) catch up."
      />

      <div className="space-y-6">
        {/* Headline metric */}
        <Card className="p-6 gap-0">
          {avg === null ? (
            <div className="flex items-baseline gap-3">
              <span className="text-lg font-medium text-[var(--text-primary)]">
                Log your first appearance to measure lead time
              </span>
            </div>
          ) : (
            <div className="flex items-baseline gap-3">
              <span className="text-3xl font-semibold tabular-nums text-[var(--text-primary)]">
                {avg}
              </span>
              <span className="text-lg text-[var(--text-secondary)]">
                {Math.abs(avg) === 1 ? "day" : "days"} average lead time
              </span>
              <span className="ml-auto text-xs tabular-nums text-[var(--text-tertiary)]">
                across {measuredCount} measured {measuredCount === 1 ? "niche" : "niches"}
              </span>
            </div>
          )}
        </Card>

        {/* Log form */}
        <Card className="p-6 gap-0">
          <h2 className="mb-4 font-heading text-base font-medium text-[var(--text-primary)]">
            Log an appearance
          </h2>
          <LogForm />
        </Card>

        {/* Table / empty state */}
        <Card className="p-0 gap-0 overflow-hidden">
          <div className="flex items-baseline justify-between gap-4 px-6 py-4">
            <h2 className="font-heading text-base font-medium text-[var(--text-primary)]">
              Logged appearances
            </h2>
            {rows.length > 0 && (
              <span className="text-xs tabular-nums text-[var(--text-tertiary)]">
                {rows.length} total
              </span>
            )}
          </div>

          {rows.length === 0 ? (
            <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
              <span className="flex size-11 items-center justify-center rounded-full bg-[var(--surface-2)] text-[var(--text-tertiary)]">
                <ShieldCheck className="size-5" />
              </span>
              <p className="text-sm font-medium text-[var(--text-primary)]">
                No appearances logged yet
              </p>
              <p className="max-w-md text-sm text-[var(--text-secondary)]">
                When a niche we surfaced later shows up in VidIQ, 1of10, or Exploding Topics,
                log it above. Each entry sharpens the lead-time number that proves the moat.
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-6">Topic</TableHead>
                  <TableHead>Format</TableHead>
                  <TableHead>We surfaced</TableHead>
                  <TableHead>VidIQ</TableHead>
                  <TableHead>1of10</TableHead>
                  <TableHead>Exploding</TableHead>
                  <TableHead className="pr-6 text-right">Lead time</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="pl-6 font-medium text-[var(--text-primary)]">
                      {row.canonical_topic}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{fmtFormat(row.format_label)}</Badge>
                    </TableCell>
                    <TableCell className="tabular-nums text-[var(--text-secondary)]">
                      {fmtDate(row.first_surfaced_by_shorts_os_at)}
                    </TableCell>
                    <TableCell className="tabular-nums text-[var(--text-secondary)]">
                      {fmtExternal(row.first_surfaced_by_vidiq_at)}
                    </TableCell>
                    <TableCell className="tabular-nums text-[var(--text-secondary)]">
                      {fmtExternal(row.first_surfaced_by_1of10_at)}
                    </TableCell>
                    <TableCell className="tabular-nums text-[var(--text-secondary)]">
                      {fmtExternal(row.first_surfaced_by_exploding_topics_at)}
                    </TableCell>
                    <TableCell className="pr-6 text-right">
                      <LagCell row={row} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Card>
      </div>
    </AppShell>
  );
}
