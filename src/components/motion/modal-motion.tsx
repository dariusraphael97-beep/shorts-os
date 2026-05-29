"use client";

import React from "react";
import { motion, useReducedMotion } from "motion/react";
import { modalScale } from "@/lib/motion";
import { cn } from "@/lib/utils";

interface ModalMotionProps {
  children: React.ReactNode;
  className?: string;
}

export function ModalMotion({ children, className }: ModalMotionProps) {
  const prefersReducedMotion = useReducedMotion();

  if (prefersReducedMotion) {
    return <div className={className}>{children}</div>;
  }

  return (
    <motion.div
      className={className}
      variants={modalScale}
      initial="initial"
      animate="animate"
      exit="exit"
    >
      {children}
    </motion.div>
  );
}
