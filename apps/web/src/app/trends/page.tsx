"use client";

// Read-only trends (§7): three-band state + sparklines. Never a number.

import { useEffect, useState } from "react";
import Link from "next/link";
import { useCopy } from "@/lib/i18n";
import { BAND_KEY } from "@/lib/copy";
import { BandCard } from "@/components/BandCard";
import { Sparkline } from "@/components/Sparkline";
import { useParticipant } from "@/lib/useParticipant";
import { supabaseBrowser } from "@/lib/supabase/client";

type BandState = { band: string; reason: string; reason_code: string | null };

export default function TrendsPage() {
  const COPY = useCopy();
  const { me, loading } = useParticipant();
  const [state, setState] = useState<BandState | null>(null);
  const [moods, setMoods] = useState<(number | null)[]>([]);
  const [energies, setEnergies] = useState<(number | null)[]>([]);

  useEffect(() => {
    if (!me) return;
    (async () => {
      const supabase = supabaseBrowser();
      const { data: bands } = await supabase
        .from("daily_state")
        .select("band, reason, reason_code, local_date")
        .eq("participant_id", me.id)
        .order("local_date", { ascending: false })
        .limit(1);
      if (bands?.[0]) setState(bands[0] as BandState);

      const { data: checkins } = await supabase
        .from("daily_checkins")
        .select("local_date, mood_1_5, energy_1_5")
        .eq("participant_id", me.id)
        .order("local_date", { ascending: true })
        .limit(30);
      setMoods((checkins ?? []).map((c) => c.mood_1_5));
      setEnergies((checkins ?? []).map((c) => c.energy_1_5));
    })();
  }, [me]);

  if (loading || !me) return <p className="p-8 text-center">{COPY.common.loading}</p>;

  const empty = !state && moods.length === 0;

  return (
    <main className="senior mx-auto flex min-h-screen max-w-md flex-col gap-6 p-6">
      <h1 className="font-bold">{COPY.trends.title}</h1>

      {empty && <p className="text-stone-500">{COPY.trends.empty}</p>}

      {state && (() => {
        const key = BAND_KEY[state.band];
        const label = key ? COPY.trends.bandLabel[key] : state.band;
        const reason = state.reason_code
          ? (COPY.trends.reasons as Record<string, string>)[state.reason_code] ?? state.reason
          : state.reason;
        return <BandCard band={state.band} label={label} reason={reason} />;
      })()}

      {moods.length > 0 && (
        <section className="rounded-2xl border-2 border-stone-200 bg-white p-5">
          <h2 className="font-semibold">{COPY.trends.mood} · {COPY.trends.recentDays}</h2>
          <Sparkline values={moods} />
          <h2 className="mt-4 font-semibold">{COPY.trends.energy}</h2>
          <Sparkline values={energies} />
        </section>
      )}

      <Link href="/checkin" className="text-stone-500 underline">{COPY.common.back}</Link>
    </main>
  );
}
