"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useCopy } from "@/lib/i18n";
import { CompanionView } from "@/components/CompanionView";
import { useParticipant } from "@/lib/useParticipant";
import { supabaseBrowser } from "@/lib/supabase/client";

export default function CompanionPage() {
  const COPY = useCopy();
  const { me, loading } = useParticipant();
  const [growth, setGrowth] = useState(0);
  const [rate, setRate] = useState(0);

  useEffect(() => {
    if (!me) return;
    (async () => {
      const { data } = await supabaseBrowser()
        .from("companion_state")
        .select("growth_level, completion_rate_14d")
        .eq("participant_id", me.id)
        .maybeSingle();
      if (data) {
        setGrowth(data.growth_level);
        setRate(data.completion_rate_14d);
      }
    })();
  }, [me]);

  if (loading || !me) return <p className="p-8 text-center">{COPY.common.loading}</p>;

  return (
    <main className="senior mx-auto flex min-h-screen max-w-md flex-col items-center gap-6 p-6">
      <h1 className="font-bold">{COPY.companion.title}</h1>
      <CompanionView growthLevel={growth} />
      <p className="text-center text-stone-600">{COPY.companion.message(rate)}</p>
      <Link href="/checkin" className="text-stone-500 underline">{COPY.common.back}</Link>
    </main>
  );
}
