"use client";

import React from "react";
import { motion, useReducedMotion } from "motion/react";
import { backdropFade, modalScale } from "@/lib/motion";
import { cn } from "@/lib/utils";

interface ModalMotionProps {
  children: React.ReactNode;
  className?: string;
  backdropClassName?: string;
  onBackdropClick?: React.MouseEventHandler<HTMLDivElement>;
}

export function ModalMotion({
  children,
  className,
  backdropClassName,
  onBackdropClick,
}: ModalMotionProps) {
  const prefersReducedMotion = useReducedMotion();

  if (prefersReducedMotion) {
    return (
      <>
        <div
          className={cn(
            "fixed inset-0 z-40 bg-black/40",
            backdropClassName,
          )}
          style={{ backdropFilter: "var(--glass-blur)" }}
          onClick={onBackdropClick}
        />
        <div className={cn("relative z-50", className)}>{children}</div>
      </>
    );
  }

  return (
    <>
      <motion.div
        className={cn(
          "fixed inset-0 z-40 bg-black/40",
          backdropClassName,
        )}
        style={{ backdropFilter: "var(--glass-blur)" }}
        variants={backdropFade}
        initial="initial"
        animate="animate"
        exit="exit"
        onClick={onBackdropClick}
      />
      <motion.div
        className={cn("relative z-50", className)}
        variants={modalScale}
        initial="initial"
        animate="animate"
        exit="exit"
      >
        {children}
      </motion.div>
    </>
  );
}
