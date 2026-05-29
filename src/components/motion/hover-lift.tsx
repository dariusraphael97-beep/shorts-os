"use client";

import React from "react";
import { motion, useReducedMotion } from "motion/react";
import { hoverLift } from "@/lib/motion";
import { cn } from "@/lib/utils";

interface HoverLiftProps {
  children: React.ReactNode;
  className?: string;
}

export function HoverLift({ children, className }: HoverLiftProps) {
  const prefersReducedMotion = useReducedMotion();

  if (prefersReducedMotion) {
    return <div className={className}>{children}</div>;
  }

  return (
    <motion.div
      className={className}
      variants={hoverLift}
      initial="rest"
      whileHover="hover"
    >
      {children}
    </motion.div>
  );
}
