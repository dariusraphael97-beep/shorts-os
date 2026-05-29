"use client";

import React from "react";
import { cn } from "@/lib/utils";
import { DiscoveryStateBadge } from "@/components/compositions/discovery-state-badge";
import { ProductionFitBadge } from "@/components/compositions/production-fit-badge";
import { ProvenBandBadge } from "@/components/compositions/proven-band-badge";
import { OutlierBadge } from "@/components/compositions/outlier-badge";
import { VelocitySparkline } from "@/components/compositions/velocity-sparkline";
import { HoverLift, Tappable } from "@/components/motion";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";

export interface NicheCardProps {
  title: string;
  summary?: string;
  velocityValues: number[];
  velocityLabel?: string;
  outlierMultiplier?: number;
  discoveryState: string;
  productionFit: string;
  provenBand?: string;
  onOpen?: () => void;
}

function CardInner({
  title,
  summary,
  velocityValues,
  velocityLabel,
  outlierMultiplier,
  discoveryState,
  productionFit,
  provenBand,
}: Omit<NicheCardProps, "onOpen">) {
  return (
    <Card className="cursor-pointer transition-colors">
      {/* Top row: title + ProvenBandBadge */}
      <CardHeader className="flex-row items-center gap-3">
        <p className="min-w-0 flex-1 truncate text-lg font-semibold leading-snug text-[var(--text-primary)]">
          {title}
        </p>
        {provenBand !== undefined && (
          <span className="shrink-0">
            <ProvenBandBadge band={provenBand} />
          </span>
        )}
      </CardHeader>

      {/* Summary (2-line clamp) */}
      {summary !== undefined && (
        <CardContent className="-mt-2">
          <p className="line-clamp-2 text-sm text-[var(--text-secondary)]">
            {summary}
          </p>
        </CardContent>
      )}

      {/* Pills row */}
      <CardContent className={cn(summary === undefined && "-mt-2")}>
        <div className="flex flex-wrap items-center gap-2">
          <DiscoveryStateBadge state={discoveryState} />
          <ProductionFitBadge fit={productionFit} />
          {outlierMultiplier !== undefined && (
            <OutlierBadge multiplier={outlierMultiplier} />
          )}
        </div>
      </CardContent>

      {/* Bottom: sparkline + velocity label */}
      <CardFooter className="border-t bg-transparent">
        <div className="flex w-full items-center justify-between gap-3">
          <VelocitySparkline
            values={velocityValues}
            width={96}
            height={24}
            showArea
          />
          {velocityLabel !== undefined && (
            <span className="shrink-0 font-mono text-xs text-[var(--text-tertiary)]">
              {velocityLabel}
            </span>
          )}
        </div>
      </CardFooter>
    </Card>
  );
}

export function NicheCard(props: NicheCardProps) {
  const { onOpen } = props;

  if (onOpen) {
    const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        onOpen();
      }
    };

    return (
      <HoverLift>
        <div
          role="button"
          tabIndex={0}
          onKeyDown={handleKeyDown}
          className="rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2"
        >
          <Tappable onClick={onOpen}>
            <CardInner {...props} />
          </Tappable>
        </div>
      </HoverLift>
    );
  }

  return (
    <HoverLift>
      <CardInner {...props} />
    </HoverLift>
  );
}
