"use client";

// The companion (Invariant 4): it grows more or grows less. It cannot get
// sick, sad, or die, and there is no streak anywhere in this component.
// Stage is a pure function of cumulative growth_level.

import { useCopy } from "@/lib/i18n";

export function stageFor(growthLevel: number): number {
  if (growthLevel < 3) return 0;
  if (growthLevel < 10) return 1;
  if (growthLevel < 25) return 2;
  if (growthLevel < 50) return 3;
  if (growthLevel < 90) return 4;
  return 5;
}

const STAGE_EMOJI = ["🥚", "🐣", "🐥", "🐤", "🐔", "🌟🐔🌟"];
const STAGE_SIZE = ["text-6xl", "text-7xl", "text-7xl", "text-8xl", "text-8xl", "text-8xl"];

export function CompanionView({
  growthLevel,
  celebrating = false,
}: {
  growthLevel: number;
  celebrating?: boolean;
}) {
  const COPY = useCopy();
  const stage = stageFor(growthLevel);
  return (
    <div className="flex flex-col items-center gap-2">
      <div className={`${STAGE_SIZE[stage]} ${celebrating ? "animate-bounce" : ""}`} aria-hidden>
        {STAGE_EMOJI[stage]}
      </div>
      <div className="text-stone-600">{COPY.companion.stages[stage]}</div>
    </div>
  );
}
