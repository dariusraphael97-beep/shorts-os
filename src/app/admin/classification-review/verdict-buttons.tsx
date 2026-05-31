"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

type Verdict = "correct" | "wrong" | "partial";

export function VerdictButtons({ id }: { id: string }) {
  const [pending, setPending] = useState<Verdict | null>(null);
  const router = useRouter();
  async function send(verdict: Verdict) {
    setPending(verdict);
    try {
      const res = await fetch("/api/admin/review-sample", {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id, verdict }),
      });
      if (res.ok) { toast.success(`Marked ${verdict}`); router.refresh(); }
      else toast.error("Failed to save verdict");
    } finally { setPending(null); }
  }
  return (
    <div className="flex gap-2">
      <Button size="sm" variant="outline" disabled={pending !== null} onClick={() => send("correct")}>Correct</Button>
      <Button size="sm" variant="outline" disabled={pending !== null} onClick={() => send("partial")}>Partial</Button>
      <Button size="sm" variant="outline" disabled={pending !== null} onClick={() => send("wrong")}>Wrong</Button>
    </div>
  );
}
