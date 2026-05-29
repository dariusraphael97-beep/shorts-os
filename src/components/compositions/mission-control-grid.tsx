import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface MissionControlGridProps {
  children: ReactNode;
  className?: string;
}

export function MissionControlGrid({ children, className }: MissionControlGridProps) {
  return (
    <div className={cn("grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3", className)}>
      {children}
    </div>
  );
}
