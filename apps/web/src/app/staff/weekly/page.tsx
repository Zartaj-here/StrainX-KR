"use client";

// Weekly entry (§9): Monday — 7 days of pedometer numbers per person
// (the device holds 7 days). Wednesday — grip / blood pressure / weight.

import { useCallback, useEffect, useMemo, useState } from "react";
import { useCopy } from "@/lib/i18n";
import { useStaff } from "@/lib/useStaff";
import { supabaseBrowser } from "@/lib/supabase/client";

type P = { id: string; display_name: string };

function isoDaysBack(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function WeeklyPage() {
  const COPY = useCopy();
  const { staff, loading } = useStaff();
  const [tab, setTab] = useState<"steps" | "clinical">("steps");
  const [participants, setParticipants] = useState<P[]>([]);
  const [steps, setSteps] = useState<Record<string, Record<string, string>>>({});
  const [clinical, setClinical] = useState<Record<string, { grip: string; sys: string; dia: string; weight: string }>>({});
  const [savedMsg, setSavedMsg] = useState("");

  // Last 7 days ending yesterday (entered on Monday for the prior week).
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => isoDaysBack(7 - i)), []);

  const load = useCallback(async () => {
    if (!staff) return;
    const { data: ps } = await supabaseBrowser()
      .from("participants")
      .select("id, display_name")
      .eq("center_id", staff.center_id)
      .is("withdrawn_at", null)
      .order("display_name");
    setParticipants(ps ?? []);
  }, [staff]);

  useEffect(() => { void load(); }, [load]);

  if (loading || !staff) return <p className="p-8">{COPY.common.loading}</p>;

  const saveSteps = async () => {
    const rows: { participant_id: string; local_date: string; steps: number; entered_by_staff_id: string }[] = [];
    for (const [pid, byDay] of Object.entries(steps)) {
      for (const [day, val] of Object.entries(byDay)) {
        const n = parseInt(val, 10);
        if (Number.isFinite(n) && n >= 0) {
          rows.push({ participant_id: pid, local_date: day, steps: n, entered_by_staff_id: staff.id });
        }
      }
    }
    if (rows.length) {
      await supabaseBrowser()
        .from("pedometer_readings")
        .upsert(rows, { onConflict: "participant_id,local_date" });
    }
    setSavedMsg(COPY.staff.weekly.saved);
    setTimeout(() => setSavedMsg(""), 2000);
  };

  const saveClinical = async () => {
    const rows = Object.entries(clinical)
      .map(([pid, v]) => ({
        participant_id: pid,
        grip_strength_kg: v.grip ? parseFloat(v.grip) : null,
        systolic: v.sys ? parseInt(v.sys, 10) : null,
        diastolic: v.dia ? parseInt(v.dia, 10) : null,
        weight_kg: v.weight ? parseFloat(v.weight) : null,
      }))
      .filter((r) => r.grip_strength_kg != null || r.systolic != null || r.weight_kg != null);
    if (rows.length) {
      await supabaseBrowser().from("clinical_measures").insert(rows);
    }
    setClinical({});
    setSavedMsg(COPY.staff.weekly.saved);
    setTimeout(() => setSavedMsg(""), 2000);
  };

  return (
    <main className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">{COPY.staff.weekly.title}</h1>
      <div className="flex gap-2">
        <button onClick={() => setTab("steps")}
          className={`rounded-lg px-4 py-2 font-semibold ${tab === "steps" ? "bg-amber-600 text-white" : "bg-stone-100 text-stone-600"}`}>
          {COPY.staff.weekly.pedometer}
        </button>
        <button onClick={() => setTab("clinical")}
          className={`rounded-lg px-4 py-2 font-semibold ${tab === "clinical" ? "bg-amber-600 text-white" : "bg-stone-100 text-stone-600"}`}>
          {COPY.staff.weekly.clinical}
        </button>
        {savedMsg && <span className="self-center text-green-700">{savedMsg}</span>}
      </div>

      {tab === "steps" && (
        <section className="overflow-x-auto">
          <p className="mb-2 text-sm text-stone-500">{COPY.staff.weekly.pedometerHint}</p>
          <table className="min-w-full border-collapse text-sm">
            <thead>
              <tr>
                <th className="border border-stone-200 bg-stone-50 p-2 text-left">이름</th>
                {days.map((d) => (
                  <th key={d} className="border border-stone-200 bg-stone-50 p-2">{d.slice(5)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {participants.map((p) => (
                <tr key={p.id}>
                  <td className="border border-stone-200 p-2 font-semibold">{p.display_name}</td>
                  {days.map((d) => (
                    <td key={d} className="border border-stone-200 p-1">
                      <input
                        inputMode="numeric"
                        value={steps[p.id]?.[d] ?? ""}
                        onChange={(e) =>
                          setSteps((s) => ({ ...s, [p.id]: { ...s[p.id], [d]: e.target.value.replace(/\D/g, "") } }))}
                        className="w-20 rounded border border-stone-200 p-1 text-right"
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          <button onClick={() => void saveSteps()} className="mt-3 rounded-lg bg-amber-600 px-4 py-2 font-semibold text-white">
            {COPY.staff.weekly.save}
          </button>
        </section>
      )}

      {tab === "clinical" && (
        <section className="overflow-x-auto">
          <table className="min-w-full border-collapse text-sm">
            <thead>
              <tr>
                <th className="border border-stone-200 bg-stone-50 p-2 text-left">이름</th>
                <th className="border border-stone-200 bg-stone-50 p-2">{COPY.staff.weekly.grip}</th>
                <th className="border border-stone-200 bg-stone-50 p-2">{COPY.staff.weekly.bp}</th>
                <th className="border border-stone-200 bg-stone-50 p-2">{COPY.staff.weekly.weight}</th>
              </tr>
            </thead>
            <tbody>
              {participants.map((p) => {
                const v = clinical[p.id] ?? { grip: "", sys: "", dia: "", weight: "" };
                const set = (patch: Partial<typeof v>) =>
                  setClinical((c) => ({ ...c, [p.id]: { ...v, ...patch } }));
                return (
                  <tr key={p.id}>
                    <td className="border border-stone-200 p-2 font-semibold">{p.display_name}</td>
                    <td className="border border-stone-200 p-1">
                      <input inputMode="decimal" value={v.grip} onChange={(e) => set({ grip: e.target.value })}
                        className="w-20 rounded border border-stone-200 p-1 text-right" />
                    </td>
                    <td className="border border-stone-200 p-1">
                      <div className="flex items-center gap-1">
                        <input inputMode="numeric" value={v.sys} onChange={(e) => set({ sys: e.target.value })}
                          placeholder="수축" className="w-16 rounded border border-stone-200 p-1 text-right" />
                        /
                        <input inputMode="numeric" value={v.dia} onChange={(e) => set({ dia: e.target.value })}
                          placeholder="이완" className="w-16 rounded border border-stone-200 p-1 text-right" />
                      </div>
                    </td>
                    <td className="border border-stone-200 p-1">
                      <input inputMode="decimal" value={v.weight} onChange={(e) => set({ weight: e.target.value })}
                        className="w-20 rounded border border-stone-200 p-1 text-right" />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <button onClick={() => void saveClinical()} className="mt-3 rounded-lg bg-amber-600 px-4 py-2 font-semibold text-white">
            {COPY.staff.weekly.save}
          </button>
        </section>
      )}
    </main>
  );
}
