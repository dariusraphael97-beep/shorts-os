"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export function TriggerButton({ job }: { job: string }) {
  const [pending, setPending] = useState(false);
  const router = useRouter();
  async function run() {
    setPending(true);
    try {
      const res = await fetch("/api/admin/trigger-ingestion", {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ job }),
      });
      const body = await res.json().catch(() => ({}));
      if (res.ok && body.ok) { toast.success(`Triggered ${job}`); router.refresh(); }
      else toast.error(`Trigger failed: ${body.error ?? res.status}`);
    } finally { setPending(false); }
  }
  return <Button size="sm" variant="outline" disabled={pending} onClick={run}>{pending ? "Running…" : "Run now"}</Button>;
}
