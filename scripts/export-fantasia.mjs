// De-identified export for the HRV bench-validation study (doc Tier 6). This is
// a Phase 1 deliverable: it refuses to run unless the center is in study_mode.
//
// Emits ONE row per study recording, shaped to drop into the Fantasia HRV
// comparison pipeline (doc 6.2/6.3): coded subject id (never a name), timestamp,
// paired 0–10 self-report, device, HRV metrics, covariates, and pointers to the
// raw signal file + raw video. With --with-signals it also downloads the small
// raw-waveform JSONs next to the manifest. Raw video is left as a pointer by
// default (it is large and identifiable); pass --with-video to pull it too.
//
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
//   node scripts/export-fantasia.mjs --center <uuid> --out ./export [--with-signals] [--with-video]

import { createClient } from "@supabase/supabase-js";
import { parseArgs } from "node:util";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const { values } = parseArgs({
  options: {
    center: { type: "string" },
    out: { type: "string", default: "./export" },
    "with-signals": { type: "boolean", default: false },
    "with-video": { type: "boolean", default: false },
  },
});

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the environment.");
  process.exit(1);
}
if (!values.center) {
  console.error("Required: --center <uuid>");
  process.exit(1);
}

const admin = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

async function downloadTo(bucket, ref, destDir, filename) {
  const { data, error } = await admin.storage.from(bucket).download(ref);
  if (error || !data) return null;
  const buf = Buffer.from(await data.arrayBuffer());
  await mkdir(destDir, { recursive: true });
  const dest = join(destDir, filename);
  await writeFile(dest, buf);
  return dest;
}

async function main() {
  // Defense in depth: the DB triggers already reject study writes in Phase 0,
  // but never EXPORT study data from a center that isn't a study.
  const { data: center, error: cErr } = await admin
    .from("centers")
    .select("id, name, study_mode, ethics_approval_ref")
    .eq("id", values.center)
    .single();
  if (cErr) throw cErr;
  if (!center.study_mode) {
    console.error(`Center ${values.center} is not in study_mode — nothing to export (Phase 0).`);
    process.exit(1);
  }

  const { data: recs, error: rErr } = await admin
    .from("study_recordings")
    .select(
      "id, participant_id, session_no, recorded_at, local_date, duration_s, fps, " +
      "ppg_site, ambient_light, device_model, hr_bpm, mean_rr_ms, rmssd_ms, sdnn_ms, " +
      "nn_count, sqi, raw_waveform_ref, raw_video_ref, ref_device, ref_capture, " +
      "ref_start_marker, ref_file_ref, usable, " +
      "study_self_reports ( stress_0_10, collected_at ), " +
      "study_recording_vitals ( systolic, diastolic, body_temp_c, weight_kg, sleep_hours, activity_rate )",
    )
    .order("recorded_at");
  if (rErr) throw rErr;

  const { data: profiles } = await admin
    .from("study_participant_profile")
    .select("participant_id, birth_year, sex, height_cm");
  const profileBy = new Map((profiles ?? []).map((p) => [p.participant_id, p]));

  // De-identify: stable coded subject ids (P001, P002, …) by first-seen order.
  const codeBy = new Map();
  const codeFor = (pid) => {
    if (!codeBy.has(pid)) codeBy.set(pid, `P${String(codeBy.size + 1).padStart(3, "0")}`);
    return codeBy.get(pid);
  };

  const outDir = values.out;
  const sigDir = join(outDir, "signals");
  const vidDir = join(outDir, "video");
  const nowYear = new Date().getUTCFullYear();

  const rows = [];
  for (const r of recs ?? []) {
    const subject = codeFor(r.participant_id);
    const prof = profileBy.get(r.participant_id);
    const sr = Array.isArray(r.study_self_reports) ? r.study_self_reports[0] : r.study_self_reports;
    const v = Array.isArray(r.study_recording_vitals) ? r.study_recording_vitals[0] : r.study_recording_vitals;

    let signalFile = r.raw_waveform_ref ?? null;
    if (values["with-signals"] && r.raw_waveform_ref) {
      const dest = await downloadTo("ppg-raw", r.raw_waveform_ref, sigDir, `${subject}_${r.id}.json`);
      if (dest) signalFile = dest;
    }
    let videoFile = r.raw_video_ref ?? null;
    if (values["with-video"] && r.raw_video_ref) {
      const dest = await downloadTo("ppg-video", r.raw_video_ref, vidDir, `${subject}_${r.id}.mp4`);
      if (dest) videoFile = dest;
    }

    rows.push({
      subject,                                    // coded id — never a name
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
      device_model: r.device_model,
      hrv: {
        hr_bpm: r.hr_bpm,
        mean_rr_ms: r.mean_rr_ms,
        rmssd_ms: r.rmssd_ms,   // time-domain only (doc 0.2)
        sdnn_ms: r.sdnn_ms,
        nn_count: r.nn_count,
        sqi: r.sqi,
      },
      self_report_stress_0_10: sr?.stress_0_10 ?? null,
      self_report_at: sr?.collected_at ?? null,
      vitals: v ?? null,
      reference: {
        device: r.ref_device,
        capture: r.ref_capture,
        start_marker: r.ref_start_marker,   // shared-clock t0 for offline H10 alignment
        file: r.ref_file_ref,
      },
      raw_waveform: signalFile,
      raw_video: videoFile,
      usable: r.usable,
    });
  }

  await mkdir(outDir, { recursive: true });
  const manifest = {
    generated_at: new Date().toISOString(),
    ethics_approval_ref: center.ethics_approval_ref,
    subjects: codeBy.size,
    recordings: rows.length,
    note: "De-identified. Time-domain HRV only. Confirm field names against the Fantasia comparison script.",
    rows,
  };
  const manifestPath = join(outDir, "fantasia_manifest.json");
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2));
  console.log(`Wrote ${rows.length} recordings for ${codeBy.size} subjects → ${manifestPath}`);
  if (values["with-signals"]) console.log(`Raw signals → ${sigDir}`);
  if (values["with-video"]) console.log(`Raw video → ${vidDir}`);
}

main().catch((e) => { console.error(e.message ?? e); process.exit(1); });
