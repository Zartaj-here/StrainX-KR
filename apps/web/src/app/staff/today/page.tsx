"use client";

// THE MAIN SCREEN (§9): who hasn't checked in today, one-tap assisted
// check-in, one-tap away/hospital marking (required — otherwise empty days
// look like disengagement instead of absence), and a note field.
// Also hosts PWA pairing-code claiming, since it happens at enrollment time.

import { useCallback, useEffect, useState } from "react";
import { useCopy } from "@/lib/i18n";
import { FaceScale } from "@/components/FaceScale";
import { useStaff } from "@/lib/useStaff";
import { supabaseBrowser } from "@/lib/supabase/client";

type P = { id: string; display_name: string; photo_url: string | null };
type Checkin = { participant_id: string; assisted: boolean };
type Note = { participant_id: string; outcome: string | null };

function localDateISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function TodayPage() {
  const COPY = useCopy();
  const { staff, loading } = useStaff();
  const [participants, setParticipants] = useState<P[]>([]);
  const [checkins, setCheckins] = useState<Checkin[]>([]);
  const [todayNotes, setTodayNotes] = useState<Note[]>([]);
  const [assisting, setAssisting] = useState<P | null>(null);
  const [assistStep, setAssistStep] = useState(0);
  const [assistAnswers, setAssistAnswers] = useState<number[]>([]);
  const [noteFor, setNoteFor] = useState<P | null>(null);
  const [noteText, setNoteText] = useState("");
  const [pairFor, setPairFor] = useState<P | null>(null);
  const [pairCode, setPairCode] = useState("");
  const [pairMsg, setPairMsg] = useState("");

  const today = localDateISO();

  const load = useCallback(async () => {
    if (!staff) return;
    const supabase = supabaseBrowser();
    const { data: ps } = await supabase
      .from("participants")
      .select("id, display_name, photo_url")
      .eq("center_id", staff.center_id)
      .is("withdrawn_at", null)
      .order("display_name");
    setParticipants(ps ?? []);
    const ids = (ps ?? []).map((p) => p.id);
    if (ids.length) {
      const { data: cs } = await supabase
        .from("daily_checkins")
        .select("participant_id, assisted")
        .in("participant_id", ids)
        .eq("local_date", today);
      setCheckins(cs ?? []);
      const { data: ns } = await supabase
        .from("staff_notes")
        .select("participant_id, outcome")
        .in("participant_id", ids)
        .gte("created_at", `${today}T00:00:00`)
        .not("outcome", "is", null);
      setTodayNotes(ns ?? []);
    }
  }, [staff, today]);

  useEffect(() => { void load(); }, [load]);

  if (loading || !staff) return <p className="p-8">{COPY.common.loading}</p>;

  const doneIds = new Set(checkins.map((c) => c.participant_id));
  const awayIds = new Set(
    todayNotes.filter((n) => n.outcome === "away" || n.outcome === "hospitalized")
      .map((n) => n.participant_id),
  );
  const notDone = participants.filter((p) => !doneIds.has(p.id) && !awayIds.has(p.id));
  const done = participants.filter((p) => doneIds.has(p.id));
  const away = participants.filter((p) => awayIds.has(p.id));

  const ASSIST_QUESTIONS = [
    { title: COPY.checkin.mood, labels: COPY.faces.mood },
    { title: COPY.checkin.energy, labels: COPY.faces.energy },
    { title: COPY.checkin.pain, labels: COPY.faces.pain },
  ];

  const finishAssist = async (meds: boolean) => {
    if (!assisting) return;
    await supabaseBrowser().from("daily_checkins").insert({
      participant_id: assisting.id,
      local_date: today,
      mood_1_5: assistAnswers[0],
      energy_1_5: assistAnswers[1],
      pain_1_5: assistAnswers[2],
      medication_taken: meds,
      assisted: true,
      source: "staff",
    });
    setAssisting(null);
    setAssistStep(0);
    setAssistAnswers([]);
    await load();
  };

  const mark = async (p: P, outcome: "away" | "hospitalized") => {
    await supabaseBrowser().from("staff_notes").insert({
      participant_id: p.id,
      staff_id: staff.id,
      outcome,
    });
    await load();
  };

  const saveNote = async () => {
    if (!noteFor || !noteText.trim()) return;
    await supabaseBrowser().from("staff_notes").insert({
      participant_id: noteFor.id,
      staff_id: staff.id,
      note: noteText.trim(),
    });
    setNoteFor(null);
    setNoteText("");
  };

  const claimPair = async () => {
    if (!pairFor || pairCode.length !== 6) return;
    const { error } = await supabaseBrowser().rpc("claim_pairing_code", {
      p_code: pairCode,
      p_participant: pairFor.id,
    });
    setPairMsg(error ? COPY.common.error : COPY.staff.today.pairDone);
    if (!error) { setPairCode(""); setTimeout(() => setPairFor(null), 1200); }
  };

  // ---- assisted check-in flow (modal-ish full screen) ----
  if (assisting) {
    return (
      <div className="mx-auto max-w-md">
        <h2 className="mb-2 text-xl font-bold">{assisting.display_name}</h2>
        {assistStep < 3 ? (
          <>
            <h3 className="mb-3 text-lg font-semibold">{ASSIST_QUESTIONS[assistStep].title}</h3>
            <FaceScale
              labels={ASSIST_QUESTIONS[assistStep].labels}
              onSelect={(v) => { setAssistAnswers((a) => [...a, v]); setAssistStep((s) => s + 1); }}
            />
          </>
        ) : (
          <>
            <h3 className="mb-3 text-lg font-semibold">{COPY.checkin.meds}</h3>
            <div className="grid grid-cols-2 gap-3">
              <button onClick={() => void finishAssist(true)} className="rounded-xl bg-green-600 py-6 text-xl font-bold text-white">{COPY.checkin.yes}</button>
              <button onClick={() => void finishAssist(false)} className="rounded-xl bg-stone-400 py-6 text-xl font-bold text-white">{COPY.checkin.no}</button>
            </div>
          </>
        )}
        <button onClick={() => { setAssisting(null); setAssistStep(0); setAssistAnswers([]); }} className="mt-6 text-stone-500 underline">
          {COPY.common.back}
        </button>
      </div>
    );
  }

  return (
    <main className="flex flex-col gap-6">
      <section>
        <h1 className="mb-3 text-2xl font-bold">{COPY.staff.today.notDone}</h1>
        {notDone.length === 0 ? (
          <p className="text-green-700">{COPY.staff.today.allDone}</p>
        ) : (
          <ul className="grid gap-2">
            {notDone.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-stone-200 bg-white p-3">
                <span className="mr-auto text-lg font-semibold">{p.display_name}</span>
                <button onClick={() => setAssisting(p)} className="rounded-lg bg-amber-600 px-3 py-2 font-semibold text-white">
                  {COPY.staff.today.assist}
                </button>
                <button onClick={() => void mark(p, "away")} className="rounded-lg bg-stone-200 px-3 py-2 font-semibold text-stone-700">
                  {COPY.staff.today.markAway}
                </button>
                <button onClick={() => void mark(p, "hospitalized")} className="rounded-lg bg-stone-200 px-3 py-2 font-semibold text-stone-700">
                  {COPY.staff.today.markHospital}
                </button>
                <button onClick={() => setNoteFor(p)} className="rounded-lg border border-stone-300 px-3 py-2 text-stone-600">✏️</button>
                <button onClick={() => { setPairFor(p); setPairMsg(""); }} className="rounded-lg border border-stone-300 px-3 py-2 text-stone-600">
                  {COPY.staff.today.pairDevice}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {away.length > 0 && (
        <section>
          <h2 className="mb-2 text-lg font-bold text-stone-500">{COPY.staff.today.markAway} / {COPY.staff.today.markHospital}</h2>
          <p className="text-stone-500">{away.map((p) => p.display_name).join(", ")}</p>
        </section>
      )}

      <section>
        <h2 className="mb-2 text-lg font-bold text-stone-500">{COPY.staff.today.doneList} ({done.length}/{participants.length})</h2>
        <p className="text-stone-600">{done.map((p) => p.display_name).join(", ")}</p>
      </section>

      {noteFor && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/30 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-5">
            <h3 className="mb-2 font-bold">{noteFor.display_name}</h3>
            <textarea
              value={noteText} onChange={(e) => setNoteText(e.target.value)}
              placeholder={COPY.staff.today.noteplaceholder}
              className="h-28 w-full rounded-lg border border-stone-300 p-3"
            />
            <div className="mt-3 flex justify-end gap-2">
              <button onClick={() => setNoteFor(null)} className="px-4 py-2 text-stone-500">{COPY.common.back}</button>
              <button onClick={() => void saveNote()} className="rounded-lg bg-amber-600 px-4 py-2 font-semibold text-white">
                {COPY.staff.today.saveNote}
              </button>
            </div>
          </div>
        </div>
      )}

      {pairFor && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/30 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-5">
            <h3 className="mb-2 font-bold">{pairFor.display_name} — {COPY.staff.today.pairDevice}</h3>
            <input
              value={pairCode}
              onChange={(e) => setPairCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder={COPY.staff.today.pairPrompt}
              inputMode="numeric"
              className="w-full rounded-lg border border-stone-300 p-3 text-center text-2xl tracking-[0.3em]"
            />
            {pairMsg && <p className="mt-2 text-center">{pairMsg}</p>}
            <div className="mt-3 flex justify-end gap-2">
              <button onClick={() => setPairFor(null)} className="px-4 py-2 text-stone-500">{COPY.common.back}</button>
              <button onClick={() => void claimPair()} className="rounded-lg bg-amber-600 px-4 py-2 font-semibold text-white">
                {COPY.common.confirm}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
