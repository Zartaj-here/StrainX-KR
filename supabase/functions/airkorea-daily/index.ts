// 에어코리아 daily context — runs once a day per center (Supabase cron).
// Without this, a 나쁨 air-quality day looks like low mood in the trends.
//
// Requires secrets: AIRKOREA_SERVICE_KEY (data.go.kr), optionally
// OPEN_METEO disabled — temperature/precip come from open-meteo (no key).

import { createClient } from "npm:@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const AIRKOREA_KEY = Deno.env.get("AIRKOREA_SERVICE_KEY") ?? "";

async function fetchAir(station: string) {
  if (!AIRKOREA_KEY) return { pm10: null, pm25: null };
  const u = new URL(
    "https://apis.data.go.kr/B552584/ArpltnInforInqireSvc/getMsrstnAcctoRltmMesureDnsty",
  );
  u.searchParams.set("serviceKey", AIRKOREA_KEY);
  u.searchParams.set("stationName", station);
  u.searchParams.set("dataTerm", "DAILY");
  u.searchParams.set("returnType", "json");
  u.searchParams.set("numOfRows", "24");
  const res = await fetch(u);
  if (!res.ok) return { pm10: null, pm25: null };
  const json = await res.json();
  const items: any[] = json?.response?.body?.items ?? [];
  const nums = (k: string) =>
    items.map((i) => parseFloat(i[k])).filter((v) => Number.isFinite(v));
  const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
  return { pm10: avg(nums("pm10Value")), pm25: avg(nums("pm25Value")) };
}

async function fetchWeather() {
  // Seoul default; per-center coordinates can be added to centers later.
  const u = new URL("https://api.open-meteo.com/v1/forecast");
  u.searchParams.set("latitude", "37.5665");
  u.searchParams.set("longitude", "126.9780");
  u.searchParams.set("daily", "temperature_2m_mean,precipitation_sum");
  u.searchParams.set("timezone", "Asia/Seoul");
  u.searchParams.set("past_days", "1");
  u.searchParams.set("forecast_days", "1");
  const res = await fetch(u);
  if (!res.ok) return { temp_c: null, precip_mm: null };
  const json = await res.json();
  return {
    temp_c: json?.daily?.temperature_2m_mean?.[0] ?? null,
    precip_mm: json?.daily?.precipitation_sum?.[0] ?? null,
  };
}

Deno.serve(async () => {
  try {
    const kst = new Date(Date.now() + 9 * 3600 * 1000);
    const localDate = kst.toISOString().slice(0, 10);

    const { data: centers, error } = await supabase
      .from("centers")
      .select("id, airkorea_station");
    if (error) throw error;

    for (const c of centers ?? []) {
      const air = c.airkorea_station
        ? await fetchAir(c.airkorea_station)
        : { pm10: null, pm25: null };
      const wx = await fetchWeather();
      await supabase.from("context_daily").upsert({
        center_id: c.id,
        local_date: localDate,
        pm10: air.pm10,
        pm25: air.pm25,
        temp_c: wx.temp_c,
        precip_mm: wx.precip_mm,
      });
    }
    return new Response(JSON.stringify({ ok: true, localDate }), {
      headers: { "content-type": "application/json" },
    });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ ok: false, error: String(e) }), { status: 500 });
  }
});
