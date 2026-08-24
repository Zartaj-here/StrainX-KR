"use client";

// Product telemetry (§5) — StrainX's data. Aggregate only, keyed by center,
// NEVER health values, NEVER identifiers. The database CHECK constraint
// rejects obvious violations; don't test it.

import { supabaseBrowser } from "@/lib/supabase/client";

export type TelemetryEvent =
  | "install_ok"
  | "install_fail"
  | "checkin_done"
  | "checkin_assisted"
  | "voice_done"
  | "voice_abandoned"
  | "push_unavailable"
  | "pwa_open";

export async function track(
  centerId: string | null,
  event: TelemetryEvent,
  metadata?: Record<string, string | number | boolean>,
): Promise<void> {
  if (!centerId) return;
  try {
    await supabaseBrowser().from("telemetry_events").insert({
      center_id: centerId,
      event_type: event,
      platform: /iPhone|iPad/i.test(navigator.userAgent) ? "ios" : "android",
      metadata: metadata ?? null,
    });
  } catch {
    // Telemetry must never break the care flow.
  }
}
