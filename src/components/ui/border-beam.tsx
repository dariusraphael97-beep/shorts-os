"use client";

import { cn } from "@/lib/utils";

type BorderBeamProps = {
  className?: string;
  size?: number;
  duration?: number;
  colorFrom?: string;
  colorTo?: string;
  delay?: number;
};

export function BorderBeam({
  className,
  size = 200,
  duration = 15,
  colorFrom = "#00ff88",
  colorTo = "#ffa500",
  delay = 0,
}: BorderBeamProps) {
  return (
    <div
      className={cn(
        "absolute inset-0 rounded-[inherit] [border:calc(1px)_solid_transparent]",
        "[background:conic-gradient(from_var(--angle),transparent_0%,transparent_70%,var(--from)_90%,var(--to)_100%)_border-box]",
        "[mask-composite:exclude] [mask:linear-gradient(#fff_0_0)_padding-box,linear-gradient(#fff_0_0)]",
        className,
      )}
      style={{
        ["--from" as string]: colorFrom,
        ["--to" as string]: colorTo,
        ["--angle" as string]: "0deg",
        animation: `border-beam-spin ${duration}s linear infinite`,
        animationDelay: `${delay}s`,
        ["--size" as string]: `${size}px`,
      }}
    />
  );
}
