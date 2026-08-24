"use client";

// The daily check-in: four taps, ~30 seconds (§7). Offline-first — the
// answer is queued in IndexedDB first and synced opportunistically, so the
// flow completes instantly with or without network.

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { useCopy } from "@/lib/i18n";
import { FaceScale } from "@/components/FaceScale";
import { CompanionView } from "@/components/CompanionView";
import { useParticipant } from "@/lib/useParticipant";
import { supabaseBrowser } from "@/lib/supabase/client";
import { enqueue, startAutoFlush } from "@/lib/offline-queue";
import { recordAndExtract } from "@/lib/voice";

type Step = "greet" | "mood" | "energy" | "pain" | "meds" | "voice" | "done" | "already";

function localDateISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function CheckinFlow() {
  const COPY = useCopy();
  const { me, loading } = useParticipant();
  const params = useSearchParams();
  const [step, setStep] = useState<Step>("greet");
  const [answers, setAnswers] = useState<{ mood?: number; energy?: number; pain?: number; meds?: boolean }>({});
  const [growth, setGrowth] = useState(0);
  const [recording, setRecording] = useState(false);
  const openedAt = useMemo(() => Date.now(), []);

  useEffect(() => startAutoFlush(supabaseBrowser()), []);

  // Already checked in today?
  useEffect(() => {
    if (!me) return;
    (async () => {
      const supabase = supabaseBrowser();
      const { data } = await supabase
        .from("daily_checkins")
        .select("id")
        .eq("participant_id", me.id)
        .eq("local_date", localDateISO())
        .maybeSingle();
      if (data) setStep("already");
      const { data: comp } = await supabase
        .from("companion_state")
        .select("growth_level")
        .eq("participant_id", me.id)
        .maybeSingle();
      if (comp) setGrowth(comp.growth_level);
    })();
  }, [me]);

  if (loading || !me) {
    return <p className="p-8 text-center">{COPY.common.loading}</p>;
  }

  const submit = async (meds: boolean) => {
    // latency_s: notification shown -> completion, when opened via push
    // (sw.js appends nt=<timestamp>); otherwise page-open -> completion.
    const notifiedAt = Number(params.get("nt")) || openedAt;
    const payload = {
      participant_id: me.id,
      local_date: localDateISO(),
      mood_1_5: answers.mood,
      energy_1_5: answers.energy,
      pain_1_5: answers.pain,
      medication_taken: meds,
      assisted: false,
      source: "pwa",
      latency_s: Math.round((Date.now() - notifiedAt) / 1000),
    };
    await enqueue("daily_checkins", payload);
    setGrowth((g) => g + 1);
    setStep(me.voice_enabled ? "voice" : "done");
    // Try to sync right away if we're online (also fires the companion trigger).
    void import("@/lib/offline-queue").then(({ flushQueue }) => flushQueue(supabaseBrowser()));
  };

  const doVoice = async () => {
    setRecording(true);
    try {
      const features = await recordAndExtract(20);
      if (features) {
        await supabaseBrowser().from("voice_features").insert({
          participant_id: me.id,
          ...features,
        });
      }
    } catch {
      // Mic denied or failed — the check-in is already complete either way.
    }
    setRecording(false);
    setStep("done");
  };

  return (
    <main className="senior mx-auto flex min-h-screen max-w-md flex-col items-center gap-6 p-6">
      {step === "greet" && (
        <>
          <CompanionView growthLevel={growth} />
          <h1 className="text-center font-bold">{COPY.checkin.greeting(me.display_name)}</h1>
          <button
            onClick={() => setStep("mood")}
            className="w-full rounded-2xl bg-amber-500 px-6 py-5 font-bold text-white active:bg-amber-600"
          >
            {COPY.checkin.next}
          </button>
          <Link href="/trends" className="text-stone-500 underline">{COPY.trends.title}</Link>
        </>
      )}

      {step === "mood" && (
        <>
          <h1 className="text-center font-bold">{COPY.checkin.mood}</h1>
          <FaceScale labels={COPY.faces.mood} onSelect={(v) => { setAnswers((a) => ({ ...a, mood: v })); setStep("energy"); }} />
        </>
      )}

      {step === "energy" && (
        <>
          <h1 className="text-center font-bold">{COPY.checkin.energy}</h1>
          <FaceScale labels={COPY.faces.energy} onSelect={(v) => { setAnswers((a) => ({ ...a, energy: v })); setStep("pain"); }} />
        </>
      )}

      {step === "pain" && (
        <>
          <h1 className="text-center font-bold">{COPY.checkin.pain}</h1>
          <FaceScale labels={COPY.faces.pain} onSelect={(v) => { setAnswers((a) => ({ ...a, pain: v })); setStep("meds"); }} />
        </>
      )}

      {step === "meds" && (
        <>
          <h1 className="text-center font-bold">{COPY.checkin.meds}</h1>
          <div className="grid w-full grid-cols-2 gap-4">
            <button onClick={() => void submit(true)} className="rounded-2xl bg-green-600 px-6 py-8 text-3xl font-bold text-white active:bg-green-700">
              {COPY.checkin.yes}
            </button>
            <button onClick={() => void submit(false)} className="rounded-2xl bg-stone-400 px-6 py-8 text-3xl font-bold text-white active:bg-stone-500">
              {COPY.checkin.no}
            </button>
          </div>
        </>
      )}

      {step === "voice" && (
        <>
          <h1 className="text-center font-bold">{COPY.checkin.voiceAsk}</h1>
          <p className="text-center text-stone-500">{COPY.checkin.voiceNote}</p>
          {recording ? (
            <div className="text-6xl animate-pulse" aria-hidden>🎙️</div>
          ) : (
            <div className="grid w-full gap-4">
              <button onClick={() => void doVoice()} className="rounded-2xl bg-amber-500 px-6 py-5 font-bold text-white active:bg-amber-600">
                {COPY.checkin.voiceStart}
              </button>
              <button onClick={() => setStep("done")} className="rounded-2xl bg-stone-200 px-6 py-5 font-bold text-stone-600">
                {COPY.checkin.voiceSkip}
              </button>
            </div>
          )}
        </>
      )}

      {step === "done" && (
        <>
          <CompanionView growthLevel={growth} celebrating />
          <h1 className="text-center font-bold">{COPY.checkin.done}</h1>
          <p className="text-center text-amber-700">{COPY.checkin.companionGrew}</p>
          {!navigator.onLine && (
            <p className="text-center text-stone-500">{COPY.checkin.offlineSaved}</p>
          )}
          <Link href="/companion" className="text-stone-500 underline">{COPY.companion.title}</Link>
        </>
      )}

      {step === "already" && (
        <>
          <CompanionView growthLevel={growth} />
          <h1 className="text-center font-bold">{COPY.checkin.alreadyDone}</h1>
          <div className="flex gap-6">
            <Link href="/trends" className="text-stone-500 underline">{COPY.trends.title}</Link>
            <Link href="/companion" className="text-stone-500 underline">{COPY.companion.title}</Link>
          </div>
        </>
      )}
    </main>
  );
}

export default function CheckinPage() {
  return (
    <Suspense fallback={<p className="p-8 text-center">…</p>}>
      <CheckinFlow />
    </Suspense>
  );
}
