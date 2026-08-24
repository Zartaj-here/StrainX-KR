"use client";

// PHASE 1 ONLY. Study records review + de-identified export, plus entry of the
// Tier 5.1 covariates (per-person profile + per-recording vitals). This whole
// screen is unreachable unless the center is in study_mode (checked below and
// gated in the nav). Staff may read raw HRV here and manage real names;
// participants never can (RLS: study tables are staff-read/write, kiosk
// write-only). The export is de-identified — coded subject ids, never names.

import { useCallback, useEffect, useMemo, useState } from "react";
import { useCopy } from "@/lib/i18n";
import { useStaff } from "@/lib/useStaff";
import { supabaseBrowser } from "@/lib/supabase/client";

type SelfReport = { stress_0_10: number; collected_at: string };
type Vitals = {
  systolic: number | null; diastolic: number | null; body_temp_c: number | null;
  weight_kg: number | null; sleep_hours: number | null; activity_rate: number | null;
};
type Recording = {
  id: string;
  participant_id: string;
  session_no: number | null;
  recorded_at: string;
  local_date: string;
  duration_s: number;
  fps: number | null;
  ppg_site: string | null;
  ambient_light: string | null;
  hr_bpm: number | null;
  mean_rr_ms: number | null;
  rmssd_ms: number | null;
  sdnn_ms: number | null;
  nn_count: number | null;
  sqi: number | null;
  raw_waveform_ref: string | null;
  raw_video_ref: string | null;
  ref_device: string | null;
  ref_capture: string | null;
  ref_start_marker: string | null;
  ref_file_ref: string | null;
  usable: boolean;
  study_self_reports: SelfReport | SelfReport[] | null;
  study_recording_vitals: Vitals | Vitals[] | null;
};
type Profile = { participant_id: string; birth_year: number | null; sex: string | null; height_cm: number | null };
type P = { id: string; display_name: string };

const one = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? (v[0] ?? null) : v);
const numOrNull = (s: string): number | null => (s.trim() === "" || Number.isNaN(Number(s)) ? null : Number(s));

type VitalsEdit = { systolic: string; diastolic: string; body_temp_c: string; weight_kg: string; sleep_hours: string; activity_rate: string };
type ProfileEdit = { birth_year: string; sex: string; height_cm: string };
const emptyVitals: VitalsEdit = { systolic: "", diastolic: "", body_temp_c: "", weight_kg: "", sleep_hours: "", activity_rate: "" };

export default function StudyPage() {
  const COPY = useCopy();
  const { staff, loading } = useStaff();
  const [studyMode, setStudyMode] = useState<boolean | null>(null);
  const [tab, setTab] = useState<"records" | "vitals" | "profiles">("records");
  const [recs, setRecs] = useState<Recording[]>([]);
  const [profiles, setProfiles] = useState<Map<string, Profile>>(new Map());
  const [participants, setParticipants] = useState<P[]>([]);
  const [vitalsEdits, setVitalsEdits] = useState<Record<string, VitalsEdit>>({});
  const [profileEdits, setProfileEdits] = useState<Record<string, ProfileEdit>>({});
  const [savedMsg, setSavedMsg] = useState("");

  // Stable coded subject ids (P001, P002…) by first-seen order — the de-id map.
  const codeBy = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of recs) {
      if (!m.has(r.participant_id)) m.set(r.participant_id, `P${String(m.size + 1).padStart(3, "0")}`);
    }
    return m;
  }, [recs]);

  const load = useCallback(async () => {
    if (!staff) return;
    const sb = supabaseBrowser();
    const { data: center } = await sb.from("centers").select("study_mode").eq("id", staff.center_id).maybeSingle();
    setStudyMode(center?.study_mode === true);
    if (center?.study_mode !== true) return;

    const { data } = await sb
      .from("study_recordings")
      .select(
        "id, participant_id, session_no, recorded_at, local_date, duration_s, fps, ppg_site, ambient_light, " +
        "hr_bpm, mean_rr_ms, rmssd_ms, sdnn_ms, nn_count, sqi, raw_waveform_ref, raw_video_ref, " +
        "ref_device, ref_capture, ref_start_marker, ref_file_ref, usable, " +
        "study_self_reports ( stress_0_10, collected_at ), " +
        "study_recording_vitals ( systolic, diastolic, body_temp_c, weight_kg, sleep_hours, activity_rate )",
      )
      .order("recorded_at", { ascending: false });
    const rows = (data as unknown as Recording[]) ?? [];
    setRecs(rows);

    // Prefill the per-recording vitals editor from any vitals already saved.
    const ve: Record<string, VitalsEdit> = {};
    for (const r of rows) {
      const v = one(r.study_recording_vitals);
      ve[r.id] = v
        ? {
            systolic: v.systolic?.toString() ?? "", diastolic: v.diastolic?.toString() ?? "",
            body_temp_c: v.body_temp_c?.toString() ?? "", weight_kg: v.weight_kg?.toString() ?? "",
            sleep_hours: v.sleep_hours?.toString() ?? "", activity_rate: v.activity_rate?.toString() ?? "",
          }
        : { ...emptyVitals };
    }
    setVitalsEdits(ve);

    const { data: profs } = await sb
      .from("study_participant_profile")
      .select("participant_id, birth_year, sex, height_cm");
    const pmap = new Map((profs ?? []).map((p) => [p.participant_id, p as Profile]));
    setProfiles(pmap);

    const { data: ps } = await sb
      .from("participants")
      .select("id, display_name")
      .eq("center_id", staff.center_id)
      .is("withdrawn_at", null)
      .order("display_name");
    setParticipants((ps as P[]) ?? []);

    // Prefill the profile editor.
    const pe: Record<string, ProfileEdit> = {};
    for (const p of (ps as P[]) ?? []) {
      const pr = pmap.get(p.id);
      pe[p.id] = {
        birth_year: pr?.birth_year?.toString() ?? "",
        sex: pr?.sex ?? "",
        height_cm: pr?.height_cm?.toString() ?? "",
      };
    }
    setProfileEdits(pe);
  }, [staff]);

  useEffect(() => { void load(); }, [load]);

  const flashSaved = () => { setSavedMsg(COPY.staff.study.saved); setTimeout(() => setSavedMsg(""), 2000); };

  const saveVitals = useCallback(async () => {
    const rows = recs
      .map((r) => {
        const e = vitalsEdits[r.id];
        if (!e) return null;
        const row = {
          recording_id: r.id,
          participant_id: r.participant_id,
          systolic: numOrNull(e.systolic),
          diastolic: numOrNull(e.diastolic),
          body_temp_c: numOrNull(e.body_temp_c),
          weight_kg: numOrNull(e.weight_kg),
          sleep_hours: numOrNull(e.sleep_hours),
          activity_rate: numOrNull(e.activity_rate),
        };
        const hasAny = row.systolic != null || row.diastolic != null || row.body_temp_c != null
          || row.weight_kg != null || row.sleep_hours != null || row.activity_rate != null;
        return hasAny ? row : null;
      })
      .filter(Boolean) as object[];
    if (rows.length) {
      await supabaseBrowser().from("study_recording_vitals").upsert(rows, { onConflict: "recording_id" });
    }
    flashSaved();
  }, [recs, vitalsEdits]);

  const saveProfiles = useCallback(async () => {
    const rows = participants
      .map((p) => {
        const e = profileEdits[p.id];
        if (!e) return null;
        const row = {
          participant_id: p.id,
          birth_year: numOrNull(e.birth_year),
          sex: e.sex.trim() === "" ? null : e.sex.trim(),
          height_cm: numOrNull(e.height_cm),
          updated_at: new Date().toISOString(),
        };
        const hasAny = row.birth_year != null || row.sex != null || row.height_cm != null;
        return hasAny ? row : null;
      })
      .filter(Boolean) as object[];
    if (rows.length) {
      await supabaseBrowser().from("study_participant_profile").upsert(rows, { onConflict: "participant_id" });
    }
    flashSaved();
  }, [participants, profileEdits]);

  const exportJson = useCallback(() => {
    const nowYear = new Date().getUTCFullYear();
    const rows = recs.map((r) => {
      const sr = one(r.study_self_reports);
      const v = one(r.study_recording_vitals);
      const prof = profiles.get(r.participant_id);
      return {
        subject: codeBy.get(r.participant_id), // coded id — never a name
        recording_id: r.id,
        recorded_at: r.recorded_at,
        local_date: r.local_date,
        session_no: r.session_no,
        age: prof?.birth_year ? nowYear - prof.birth_year : null,
        sex: prof?.sex ?? null,
        height_cm: prof?.height_cm ?? null,
        duration_s: r.duration_s,
        fps: r.fps,
        ppg_site: r.ppg_site,
        ambient_light: r.ambient_light,
        hrv: { hr_bpm: r.hr_bpm, mean_rr_ms: r.mean_rr_ms, rmssd_ms: r.rmssd_ms, sdnn_ms: r.sdnn_ms, nn_count: r.nn_count, sqi: r.sqi },
        self_report_stress_0_10: sr?.stress_0_10 ?? null,
        vitals: v ?? null,
        reference: { device: r.ref_device, capture: r.ref_capture, start_marker: r.ref_start_marker, file: r.ref_file_ref },
        raw_waveform: r.raw_waveform_ref,
        raw_video: r.raw_video_ref,
        usable: r.usable,
      };
    });
    const manifest = {
      generated_at: new Date().toISOString(),
      subjects: codeBy.size,
      recordings: rows.length,
      note: "De-identified. Time-domain HRV only. Confirm field names against the Fantasia comparison script.",
      rows,
    };
    const blob = new Blob([JSON.stringify(manifest, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `fantasia_manifest_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [recs, profiles, codeBy]);

  const viewVideo = useCallback(async (ref: string) => {
    const { data } = await supabaseBrowser().storage.from("ppg-video").createSignedUrl(ref, 300);
    if (data?.signedUrl) window.open(data.signedUrl, "_blank", "noopener");
  }, []);

  if (loading || !staff) return <p className="p-8">{COPY.common.loading}</p>;
  if (studyMode === false) return <p className="p-8 text-stone-500">{COPY.staff.study.disabled}</p>;

  const C = COPY.staff.study;
  const tabBtn = (key: typeof tab, label: string) => (
    <button
      onClick={() => setTab(key)}
      className={`rounded-lg px-4 py-2 font-semibold ${tab === key ? "bg-amber-600 text-white" : "bg-stone-100 text-stone-600"}`}
    >
      {label}
    </button>
  );
  const cell = "border border-stone-200 p-1";
  const inputCls = "w-16 rounded border border-stone-200 p-1 text-right";

  return (
    <main className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <h1 className="text-2xl font-bold">{C.title}</h1>
        <span className="text-sm text-stone-500">{C.count(recs.length)}</span>
        {savedMsg && <span className="text-green-700">{savedMsg}</span>}
      </div>

      <div className="flex flex-wrap gap-2">
        {tabBtn("records", C.tabRecords)}
        {tabBtn("vitals", C.tabVitals)}
        {tabBtn("profiles", C.tabProfiles)}
        {tab === "records" && (
          <button onClick={exportJson} disabled={!recs.length}
            className="ml-auto rounded-lg bg-amber-600 px-4 py-2 font-semibold text-white disabled:opacity-40">
            {C.export}
          </button>
        )}
        {tab === "vitals" && (
          <button onClick={() => void saveVitals()} disabled={!recs.length}
            className="ml-auto rounded-lg bg-amber-600 px-4 py-2 font-semibold text-white disabled:opacity-40">
            {C.save}
          </button>
        )}
        {tab === "profiles" && (
          <button onClick={() => void saveProfiles()} disabled={!participants.length}
            className="ml-auto rounded-lg bg-amber-600 px-4 py-2 font-semibold text-white disabled:opacity-40">
            {C.save}
          </button>
        )}
      </div>

      {tab === "records" && (
        <>
          <p className="text-sm text-stone-500">{C.note}</p>
          {recs.length === 0 ? (
            <p className="text-stone-500">{C.empty}</p>
          ) : (
            <section className="overflow-x-auto">
              <table className="min-w-full border-collapse text-sm">
                <thead>
                  <tr>
                    {[C.subject, C.date, C.duration, C.site, "RMSSD", "SDNN", C.selfReport, C.ref, C.video].map((h) => (
                      <th key={h} className="border border-stone-200 bg-stone-50 p-2 text-left">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {recs.map((r) => {
                    const sr = one(r.study_self_reports);
                    return (
                      <tr key={r.id} className={r.usable ? "" : "text-stone-400"}>
                        <td className="border border-stone-200 p-2 font-semibold">{codeBy.get(r.participant_id)}</td>
                        <td className="border border-stone-200 p-2">{r.local_date}</td>
                        <td className="border border-stone-200 p-2 text-right">{r.duration_s}</td>
                        <td className="border border-stone-200 p-2">{r.ppg_site ?? "—"}</td>
                        <td className="border border-stone-200 p-2 text-right">{r.rmssd_ms ?? "—"}</td>
                        <td className="border border-stone-200 p-2 text-right">{r.sdnn_ms ?? "—"}</td>
                        <td className="border border-stone-200 p-2 text-right">{sr?.stress_0_10 ?? "—"}</td>
                        <td className="border border-stone-200 p-2">
                          {r.ref_capture === "in_app" ? C.refInApp : r.ref_capture === "offline" ? C.refOffline : "—"}
                        </td>
                        <td className="border border-stone-200 p-2">
                          {r.raw_video_ref ? (
                            <button onClick={() => void viewVideo(r.raw_video_ref!)} className="text-amber-700 underline">
                              {C.viewVideo}
                            </button>
                          ) : C.noVideo}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </section>
          )}
        </>
      )}

      {tab === "vitals" && (
        recs.length === 0 ? (
          <p className="text-stone-500">{C.vitalsNeedRecording}</p>
        ) : (
          <section className="overflow-x-auto">
            <table className="min-w-full border-collapse text-sm">
              <thead>
                <tr>
                  {[C.subject, C.date, C.systolic, C.diastolic, C.bodyTemp, C.weightKg, C.sleepHours, C.activityRate].map((h) => (
                    <th key={h} className="border border-stone-200 bg-stone-50 p-2">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {recs.map((r) => {
                  const e = vitalsEdits[r.id] ?? emptyVitals;
                  const set = (patch: Partial<VitalsEdit>) =>
                    setVitalsEdits((s) => ({ ...s, [r.id]: { ...(s[r.id] ?? emptyVitals), ...patch } }));
                  const field = (k: keyof VitalsEdit) => (
                    <td className={cell}>
                      <input inputMode="decimal" value={e[k]} onChange={(ev) => set({ [k]: ev.target.value } as Partial<VitalsEdit>)} className={inputCls} />
                    </td>
                  );
                  return (
                    <tr key={r.id}>
                      <td className="border border-stone-200 p-2 font-semibold">{codeBy.get(r.participant_id)}</td>
                      <td className="border border-stone-200 p-2">{r.local_date}</td>
                      {field("systolic")}
                      {field("diastolic")}
                      {field("body_temp_c")}
                      {field("weight_kg")}
                      {field("sleep_hours")}
                      {field("activity_rate")}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>
        )
      )}

      {tab === "profiles" && (
        participants.length === 0 ? (
          <p className="text-stone-500">{C.profilesEmpty}</p>
        ) : (
          <section className="overflow-x-auto">
            <table className="min-w-full border-collapse text-sm">
              <thead>
                <tr>
                  {[C.name, C.birthYear, C.sexLabel, C.heightCm].map((h) => (
                    <th key={h} className="border border-stone-200 bg-stone-50 p-2 text-left">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {participants.map((p) => {
                  const e = profileEdits[p.id] ?? { birth_year: "", sex: "", height_cm: "" };
                  const set = (patch: Partial<ProfileEdit>) =>
                    setProfileEdits((s) => ({ ...s, [p.id]: { ...(s[p.id] ?? { birth_year: "", sex: "", height_cm: "" }), ...patch } }));
                  return (
                    <tr key={p.id}>
                      <td className="border border-stone-200 p-2 font-semibold">{p.display_name}</td>
                      <td className={cell}>
                        <input inputMode="numeric" value={e.birth_year} onChange={(ev) => set({ birth_year: ev.target.value })} className="w-24 rounded border border-stone-200 p-1 text-right" />
                      </td>
                      <td className={cell}>
                        <input value={e.sex} onChange={(ev) => set({ sex: ev.target.value })} className="w-20 rounded border border-stone-200 p-1" />
                      </td>
                      <td className={cell}>
                        <input inputMode="decimal" value={e.height_cm} onChange={(ev) => set({ height_cm: ev.target.value })} className="w-24 rounded border border-stone-200 p-1 text-right" />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>
        )
      )}
    </main>
  );
}
