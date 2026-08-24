"use client";

// Activities: create 체조/노래교실/... with physical_intensity and roster,
// plus the one thing staff actually wants — a simple before/after look per
// activity, in care language, explicitly framed as observation not causation.
//
// PHASE GATE: there is deliberately NO is_control control here. That field is
// Phase 1, the database rejects it while study_mode=false, and this screen
// only ever inserts is_control-free rows. When Phase 1 arrives, the control
// appears only if centers.study_mode is true.

import { useCallback, useEffect, useState } from "react";
import { useCopy } from "@/lib/i18n";
import { useStaff } from "@/lib/useStaff";
import { supabaseBrowser } from "@/lib/supabase/client";

type Activity = {
  id: string;
  name: string;
  physical_intensity: "none" | "light" | "moderate";
  scheduled_start: string | null;
  scheduled_end: string | null;
};
type P = { id: string; display_name: string };

export default function ActivitiesPage() {
  const COPY = useCopy();
  const { staff, loading } = useStaff();
  const [activities, setActivities] = useState<Activity[]>([]);
  const [participants, setParticipants] = useState<P[]>([]);
  const [summaries, setSummaries] = useState<Record<string, { better: number; total: number }>>({});
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [intensity, setIntensity] = useState<"none" | "light" | "moderate">("none");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [roster, setRoster] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    if (!staff) return;
    const supabase = supabaseBrowser();
    const { data: acts } = await supabase
      .from("activities")
      .select("id, name, physical_intensity, scheduled_start, scheduled_end")
      .eq("center_id", staff.center_id)
      .order("scheduled_start", { ascending: false })
      .limit(30);
    setActivities(acts ?? []);
    const { data: ps } = await supabase
      .from("participants")
      .select("id, display_name")
      .eq("center_id", staff.center_id)
      .is("withdrawn_at", null)
      .order("display_name");
    setParticipants(ps ?? []);

    // Before/after look: mood delta per participant per activity.
    const ids = (acts ?? []).map((a) => a.id);
    if (ids.length) {
      const { data: caps } = await supabase
        .from("activity_captures")
        .select("activity_id, participant_id, phase, mood_1_5")
        .in("activity_id", ids);
      const byActivity: Record<string, { better: number; total: number }> = {};
      const grouped = new Map<string, { pre?: number; post?: number }>();
      for (const c of caps ?? []) {
        if (c.mood_1_5 == null) continue;
        const k = `${c.activity_id}|${c.participant_id}`;
        const g = grouped.get(k) ?? {};
        if (c.phase === "pre") g.pre = c.mood_1_5;
        if (c.phase === "post") g.post = c.mood_1_5;
        grouped.set(k, g);
      }
      for (const [k, g] of grouped) {
        if (g.pre == null || g.post == null) continue;
        const actId = k.split("|")[0];
        byActivity[actId] ??= { better: 0, total: 0 };
        byActivity[actId].total++;
        if (g.post > g.pre) byActivity[actId].better++;
      }
      setSummaries(byActivity);
    }
  }, [staff]);

  useEffect(() => { void load(); }, [load]);

  if (loading || !staff) return <p className="p-8">{COPY.common.loading}</p>;

  const create = async () => {
    if (!name.trim()) return;
    const supabase = supabaseBrowser();
    const { data: act, error } = await supabase
      .from("activities")
      .insert({
        center_id: staff.center_id,
        created_by_staff_id: staff.id,
        name: name.trim(),
        physical_intensity: intensity,
        scheduled_start: start || null,
        scheduled_end: end || null,
      })
      .select("id")
      .single();
    if (error || !act) return;
    if (roster.size) {
      await supabase.from("activity_roster").insert(
        [...roster].map((pid) => ({ activity_id: act.id, participant_id: pid })),
      );
    }
    setCreating(false);
    setName(""); setIntensity("none"); setStart(""); setEnd(""); setRoster(new Set());
    await load();
  };

  return (
    <main className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{COPY.staff.activities.title}</h1>
        <button onClick={() => setCreating((v) => !v)} className="rounded-lg bg-amber-600 px-4 py-2 font-semibold text-white">
          {COPY.staff.activities.create}
        </button>
      </div>

      {creating && (
        <section className="rounded-2xl border border-stone-200 bg-white p-4">
          <div className="grid gap-3">
            <input value={name} onChange={(e) => setName(e.target.value)}
              placeholder={COPY.staff.activities.name}
              className="rounded-lg border border-stone-300 px-3 py-2" />
            <label className="flex items-center gap-3">
              <span className="w-32 text-stone-600">{COPY.staff.activities.intensity}</span>
              <select value={intensity} onChange={(e) => setIntensity(e.target.value as typeof intensity)}
                className="rounded-lg border border-stone-300 px-3 py-2">
                <option value="none">{COPY.staff.activities.intensityOpts.none}</option>
                <option value="light">{COPY.staff.activities.intensityOpts.light}</option>
                <option value="moderate">{COPY.staff.activities.intensityOpts.moderate}</option>
              </select>
            </label>
            <label className="flex items-center gap-3">
              <span className="w-32 text-stone-600">{COPY.staff.activities.start}</span>
              <input type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)}
                className="rounded-lg border border-stone-300 px-3 py-2" />
            </label>
            <label className="flex items-center gap-3">
              <span className="w-32 text-stone-600">{COPY.staff.activities.end}</span>
              <input type="datetime-local" value={end} onChange={(e) => setEnd(e.target.value)}
                className="rounded-lg border border-stone-300 px-3 py-2" />
            </label>
            <div>
              <p className="mb-1 text-stone-600">{COPY.staff.activities.roster}</p>
              <div className="flex flex-wrap gap-2">
                {participants.map((p) => (
                  <button key={p.id}
                    onClick={() => setRoster((r) => {
                      const n = new Set(r);
                      if (n.has(p.id)) n.delete(p.id); else n.add(p.id);
                      return n;
                    })}
                    className={`rounded-full px-3 py-1 ${roster.has(p.id) ? "bg-amber-600 text-white" : "bg-stone-100 text-stone-600"}`}>
                    {p.display_name}
                  </button>
                ))}
              </div>
            </div>
            <button onClick={() => void create()} className="rounded-lg bg-amber-600 px-4 py-2 font-semibold text-white">
              {COPY.staff.activities.save}
            </button>
          </div>
        </section>
      )}

      <section>
        <h2 className="mb-1 text-lg font-bold">{COPY.staff.activities.summaryTitle}</h2>
        <p className="mb-3 text-sm text-stone-500">{COPY.staff.activities.summaryNote}</p>
        <ul className="grid gap-2">
          {activities.map((a) => {
            const s = summaries[a.id];
            return (
              <li key={a.id} className="rounded-xl border border-stone-200 bg-white p-3">
                <div className="flex items-center justify-between">
                  <span className="font-semibold">{a.name}</span>
                  <span className="text-sm text-stone-500">
                    {COPY.staff.activities.intensityOpts[a.physical_intensity]}
                    {a.scheduled_start ? ` · ${new Date(a.scheduled_start).toLocaleString("ko-KR")}` : ""}
                  </span>
                </div>
                <p className="mt-1 text-stone-600">
                  {s ? COPY.staff.activities.moodBetter(s.better, s.total) : COPY.staff.activities.noCaptures}
                </p>
              </li>
            );
          })}
        </ul>
      </section>
    </main>
  );
}
