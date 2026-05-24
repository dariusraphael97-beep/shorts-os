"use client";

import React, { useRef } from "react";
import { motion, useAnimationFrame, useMotionTemplate, useMotionValue, useTransform } from "framer-motion";
import { cn } from "@/lib/utils";

type MovingBorderProps = {
  children: React.ReactNode;
  duration?: number;
  rx?: string;
  ry?: string;
  [key: string]: unknown;
};

export function MovingBorder({
  children,
  duration = 2000,
  rx,
  ry,
  ...otherProps
}: MovingBorderProps) {
  const pathRef = useRef<SVGRectElement>(null);
  const progress = useMotionValue(0);

  useAnimationFrame((time) => {
    const length = pathRef.current?.getTotalLength();
    if (length) {
      const pxPerMillisecond = length / duration;
      progress.set((time * pxPerMillisecond) % length);
    }
  });

  const x = useTransform(progress, (val) => pathRef.current?.getPointAtLength(val)?.x ?? 0);
  const y = useTransform(progress, (val) => pathRef.current?.getPointAtLength(val)?.y ?? 0);
  const transform = useMotionTemplate`translateX(${x}px) translateY(${y}px) translateX(-50%) translateY(-50%)`;

  return (
    <div className="relative overflow-hidden p-[1px] rounded-lg" {...(otherProps as React.HTMLAttributes<HTMLDivElement>)}>
      <svg
        xmlns="http://www.w3.org/2000/svg"
        preserveAspectRatio="none"
        className="absolute inset-0 h-full w-full"
      >
        <rect
          fill="none"
          width="100%"
          height="100%"
          rx={rx ?? "10"}
          ry={ry ?? "10"}
          ref={pathRef}
        />
      </svg>
      <motion.div
        style={{ transform, position: "absolute" }}
        className="h-20 w-20 opacity-[0.8] bg-[radial-gradient(var(--accent-electric)_40%,transparent_60%)]"
      />
      <div className="relative">{children}</div>
    </div>
  );
}
