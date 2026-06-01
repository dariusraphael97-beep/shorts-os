"use client";

import { useEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { fadeRise } from "@/lib/motion";
import type { AgentCardVM } from "@/lib/agents/dashboard/load";
import { AgentCard } from "./agent-card";

const POLL_MS = 15_000;

export function AgentsRefresh({ initial }: { initial: AgentCardVM[] }) {
  const [vms, setVms] = useState<AgentCardVM[]>(initial);
  const prefersReducedMotion = useReducedMotion();

  // Guards: skip overlapping fetches; never setState after unmount.
  const inFlight = useRef(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;

    async function poll() {
      if (inFlight.current) return;
      inFlight.current = true;
      try {
        const res = await fetch("/api/agents/status", { cache: "no-store" });
        if (!res.ok) return;
        const next = (await res.json()) as AgentCardVM[];
        if (mounted.current) setVms(next);
      } catch {
        // Network blip — keep the last good state, try again next tick.
      } finally {
        inFlight.current = false;
      }
    }

    const id = window.setInterval(poll, POLL_MS);
    return () => {
      mounted.current = false;
      window.clearInterval(id);
    };
  }, []);

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {vms.map((vm, idx) =>
        prefersReducedMotion ? (
          <div key={vm.id} className="h-full">
            <AgentCard vm={vm} />
          </div>
        ) : (
          <motion.div
            key={vm.id}
            className="h-full"
            variants={fadeRise}
            initial="initial"
            animate="animate"
            transition={{ delay: idx * 0.05 }}
          >
            <AgentCard vm={vm} />
          </motion.div>
        ),
      )}
    </div>
  );
}
