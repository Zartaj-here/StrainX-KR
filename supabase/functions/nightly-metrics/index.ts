// Nightly derived metrics — runs once a day (schedule via Supabase cron, see README).
//
// All modelling is WITHIN-PERSON: today's value z-scored against that person's
// rolling 14-day baseline (Invariant 10). Self-report is the label and is never
// an input to strain_index (Invariant 5) — only autonomic + pedometer channels
// feed the composite. The numeric index is written to derived_daily (staff/
// service only); participants receive only a band + reason via daily_state.

import { createClient } from "npm:@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const BASELINE_DAYS = 14;

type Num = number | null;

function mean(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}
function sd(xs: number[]): number {
  const m = mean(xs);
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / Math.max(1, xs.length - 1));
}
/** z of `today` vs trailing window; null if the baseline is too thin. */
function zScore(today: Num, window: number[]): Num {
  if (today == null || window.length < 3) return null;
  const s = sd(window);
  if (s === 0) return 0;
  return (today - mean(window)) / s;
}

// Band mapping. Weights: ↑HR, ↓HRV, ↓steps. Respiratory rate is kept as a
// channel in derived_daily but not weighted into the composite until the PPG
// resp estimate is validated (open item 3 in the handoff).
function toBand(hrZ: Num, rmssdZ: Num, stepsZ: Num): {
  index: Num; band: "안정" | "부담" | "소진" | null; reason: string; reason_code: string | null;
} {
  const parts: { w: number; z: number; up: string; }[] = [];
  if (hrZ != null) parts.push({ w: 0.4, z: hrZ, up: "심박" });
  if (rmssdZ != null) parts.push({ w: 0.4, z: -rmssdZ, up: "회복" });
  if (stepsZ != null) parts.push({ w: 0.2, z: -stepsZ, up: "걸음" });
  if (parts.length === 0) return { index: null, band: null, reason: "", reason_code: null };

  const wsum = parts.reduce((a, p) => a + p.w, 0);
  const index = parts.reduce((a, p) => a + p.w * p.z, 0) / wsum;

  // Reason: a language-neutral code the app maps to localized care copy (0008).
  // The Korean text is kept too, as a fallback for clients that don't map codes.
  const dominant = parts.reduce((a, p) => (Math.abs(p.z) > Math.abs(a.z) ? p : a));
  let reason = "평소와 비슷하게 지내고 계세요.";
  let reason_code = "steady";
  if (index >= 0.5) {
    if (dominant.up === "심박") { reason = "평소보다 심장이 조금 바쁘게 뛰었어요. 오늘은 천천히 쉬어가요."; reason_code = "hr_high"; }
    else if (dominant.up === "회복") { reason = "평소보다 몸이 쉬는 시간이 조금 부족했어요."; reason_code = "recovery_low"; }
    else { reason = "평소보다 움직임이 조금 적었어요. 가볍게 걸어보는 건 어떨까요?"; reason_code = "steps_low"; }
  }
  const band = index == null ? null : index < 0.5 ? "안정" : index < 1.25 ? "부담" : "소진";
  return { index, band, reason, reason_code };
}

async function computeForDate(localDate: string) {
  const { data: participants, error: pErr } = await supabase
    .from("participants")
    .select("id, center_id")
    .is("withdrawn_at", null);
  if (pErr) throw pErr;

  const since = new Date(localDate);
  since.setDate(since.getDate() - BASELINE_DAYS);
  const sinceIso = since.toISOString().slice(0, 10);

  for (const p of participants ?? []) {
    // Autonomic channel: usable daily-context PPG readings only.
    const { data: ppg } = await supabase
      .from("ppg_readings")
      .select("captured_at, hr_bpm, rmssd_ms, resp_rate, usable, context")
      .eq("participant_id", p.id)
      .eq("context", "daily")
      .gte("captured_at", sinceIso)
      .order("captured_at");

    const byDay = new Map<string, { hr: number[]; rmssd: number[]; resp: number[] }>();
    for (const r of ppg ?? []) {
      const d = (r.captured_at as string).slice(0, 10);
      const e = byDay.get(d) ?? { hr: [], rmssd: [], resp: [] };
      if (r.hr_bpm != null) e.hr.push(r.hr_bpm);
      if (r.usable && r.rmssd_ms != null) e.rmssd.push(r.rmssd_ms);
      if (r.usable && r.resp_rate != null) e.resp.push(r.resp_rate);
      byDay.set(d, e);
    }
    const dayMeans = (k: "hr" | "rmssd" | "resp") =>
      [...byDay.entries()]
        .filter(([d, v]) => d < localDate && v[k].length)
        .map(([, v]) => mean(v[k]));
    const today = byDay.get(localDate);
    const hrZ = zScore(today?.hr.length ? mean(today.hr) : null, dayMeans("hr"));
    const rmssdZ = zScore(today?.rmssd.length ? mean(today.rmssd) : null, dayMeans("rmssd"));
    const respZ = zScore(today?.resp.length ? mean(today.resp) : null, dayMeans("resp"));

    // Pedometer channel.
    const { data: steps } = await supabase
      .from("pedometer_readings")
      .select("local_date, steps")
      .eq("participant_id", p.id)
      .gte("local_date", sinceIso)
      .lte("local_date", localDate);
    const stepsToday = steps?.find((s) => s.local_date === localDate)?.steps ?? null;
    const stepsWindow = (steps ?? []).filter((s) => s.local_date < localDate).map((s) => s.steps);
    const stepsZ = zScore(stepsToday, stepsWindow);

    const { index, band, reason, reason_code } = toBand(hrZ, rmssdZ, stepsZ);

    await supabase.from("derived_daily").upsert({
      participant_id: p.id,
      local_date: localDate,
      hr_z: hrZ,
      rmssd_z: rmssdZ,
      resp_rate_z: respZ,
      steps_z: stepsZ,
      strain_index: index,
      band,
      band_reason: reason,
      computed_at: new Date().toISOString(),
    });

    if (band) {
      await supabase.from("daily_state").upsert({
        participant_id: p.id,
        local_date: localDate,
        band,
        reason,
        reason_code,
      });
    }
  }
}

// Activity reactivity: pre/post/+30 deltas per (activity, participant),
// always carrying physical_intensity so nobody can read a post-체조 HR bump
// as stress. Care observations, not causal claims.
async function computeReactivity() {
  const { data: captures, error } = await supabase
    .from("activity_captures")
    .select(
      "activity_id, participant_id, phase, mood_1_5, captured_at, " +
      "ppg_readings ( hr_bpm, rmssd_ms, usable ), " +
      "activities ( physical_intensity )",
    );
  if (error) throw error;

  const groups = new Map<string, any[]>();
  for (const c of captures ?? []) {
    const k = `${c.activity_id}|${c.participant_id}`;
    groups.set(k, [...(groups.get(k) ?? []), c]);
  }

  for (const [k, rows] of groups) {
    const pre = rows.find((r) => r.phase === "pre");
    const post = rows.find((r) => r.phase === "post");
    const rec = rows.find((r) => r.phase === "recovery30");
    if (!pre || !post) continue;
    const [activity_id, participant_id] = k.split("|");
    const hr = (r: any) => r?.ppg_readings?.hr_bpm ?? null;
    const rmssd = (r: any) => (r?.ppg_readings?.usable ? r.ppg_readings.rmssd_ms : null);

    const dHr = hr(post) != null && hr(pre) != null ? hr(post) - hr(pre) : null;
    const dRmssd = rmssd(post) != null && rmssd(pre) != null ? rmssd(post) - rmssd(pre) : null;
    const dMood = post.mood_1_5 != null && pre.mood_1_5 != null ? post.mood_1_5 - pre.mood_1_5 : null;
    // Recovery slope: bpm per minute from post -> +30. The meaningful variable
    // after physical exertion.
    const slope = hr(rec) != null && hr(post) != null ? (hr(rec) - hr(post)) / 30 : null;

    await supabase.from("activity_reactivity").upsert({
      activity_id,
      participant_id,
      physical_intensity: rows[0]?.activities?.physical_intensity ?? "none",
      delta_hr_pre_post: dHr,
      delta_rmssd_pre_post: dRmssd,
      recovery_slope_30min: slope,
      delta_mood_pre_post: dMood,
      computed_at: new Date().toISOString(),
    });
  }
}

// Operational telemetry (StrainX's own data): aggregates only, per center.
async function computeOperational(localDate: string) {
  const { data: centers } = await supabase.from("centers").select("id");
  for (const c of centers ?? []) {
    const { data: ps } = await supabase
      .from("participants").select("id").eq("center_id", c.id).is("withdrawn_at", null);
    const ids = (ps ?? []).map((p) => p.id);
    if (!ids.length) continue;

    const { count: checkins } = await supabase
      .from("daily_checkins").select("id", { count: "exact", head: true })
      .in("participant_id", ids).eq("local_date", localDate);
    const { count: assisted } = await supabase
      .from("daily_checkins").select("id", { count: "exact", head: true })
      .in("participant_id", ids).eq("local_date", localDate).eq("assisted", true);
    const { data: ppgAll } = await supabase
      .from("ppg_readings").select("usable")
      .in("participant_id", ids)
      .gte("captured_at", `${localDate}T00:00:00`)
      .lte("captured_at", `${localDate}T23:59:59`);

    await supabase.from("telemetry_events").insert({
      center_id: c.id,
      event_type: "daily_ops_rollup",
      metadata: {
        local_date: localDate,
        enrolled: ids.length,
        checkin_adherence: ids.length ? (checkins ?? 0) / ids.length : 0,
        assisted_ratio: checkins ? (assisted ?? 0) / checkins : 0,
        ppg_reads: ppgAll?.length ?? 0,
        ppg_usable_rate: ppgAll?.length
          ? ppgAll.filter((r) => r.usable).length / ppgAll.length
          : null,
      },
    });
  }
}

Deno.serve(async (req) => {
  try {
    const url = new URL(req.url);
    // KST "today" by default; the cron fires just after midnight KST.
    const kstNow = new Date(Date.now() + 9 * 3600 * 1000);
    kstNow.setUTCDate(kstNow.getUTCDate() - 1); // compute for the day that just ended
    const localDate = url.searchParams.get("date") ?? kstNow.toISOString().slice(0, 10);

    await computeForDate(localDate);
    await computeReactivity();
    await computeOperational(localDate);

    return new Response(JSON.stringify({ ok: true, localDate }), {
      headers: { "content-type": "application/json" },
    });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ ok: false, error: String(e) }), { status: 500 });
  }
});
