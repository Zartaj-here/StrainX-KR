"use client";

// A sparkline with NO numeric axis: trends show shape, never numbers
// (Invariant 1 lives here too — the participant surface has no values).

export function Sparkline({
  values,
  max = 5,
  className = "",
}: {
  values: (number | null)[];
  max?: number;
  className?: string;
}) {
  const w = 300;
  const h = 60;
  const pts = values
    .map((v, i) =>
      v == null
        ? null
        : `${(i / Math.max(1, values.length - 1)) * w},${h - (v / max) * (h - 8) - 4}`,
    )
    .filter(Boolean)
    .join(" ");

  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      className={`w-full h-16 ${className}`}
      role="img"
      aria-label="변화 그래프"
    >
      <polyline
        points={pts}
        fill="none"
        stroke="#7c6f5a"
        strokeWidth="4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
