"use client";

// Three-band state display (Invariant 1): the band, in words, ALWAYS with its
// reason. Never a number, never a gauge, never a percentage.

import { BAND_COLORS } from "@/lib/copy";

// `band` is the DB value (Korean band_t enum) used only to pick the color;
// `label` and `reason` are already localized by the caller.
export function BandCard({ band, label, reason }: { band: string; label: string; reason: string }) {
  return (
    <div className="rounded-2xl border-2 border-stone-200 bg-white p-5">
      <span
        className={`inline-block rounded-full px-4 py-1 text-white font-bold ${BAND_COLORS[band] ?? "bg-stone-500"}`}
      >
        {label}
      </span>
      <p className="mt-3">{reason}</p>
    </div>
  );
}
