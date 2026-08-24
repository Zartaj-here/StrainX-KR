"use client";

// Five big faces, one tap. Labels come from copy.ts per question.

const FACES = ["😣", "🙁", "😐", "🙂", "😄"];

export function FaceScale({
  labels,
  onSelect,
}: {
  labels: readonly string[];
  onSelect: (value: 1 | 2 | 3 | 4 | 5) => void;
}) {
  return (
    <div className="grid grid-cols-1 gap-3 w-full">
      {FACES.map((face, i) => (
        <button
          key={i}
          onClick={() => onSelect((i + 1) as 1 | 2 | 3 | 4 | 5)}
          className="flex items-center gap-4 rounded-2xl border-2 border-stone-300 bg-white px-5 py-4 text-left active:bg-amber-100"
        >
          <span className="text-5xl" aria-hidden>{face}</span>
          <span className="font-semibold">{labels[i]}</span>
        </button>
      ))}
    </div>
  );
}
