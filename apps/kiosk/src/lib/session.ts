// Kiosk session context: which physical device this is, which staff member
// signed it in, and which center it belongs to. Every capture row stores
// participant_id + device_id + operator_staff_id + capture context (§8).

import { supabase } from "./supabase";

export type KioskSession = {
  deviceId: string;
  centerId: string;
  deviceLabel: string;
  operatorStaffId: string;
  // The phase gate, read from the kiosk's own center row (RLS allows this via
  // centers_staff_read). Study capture UI keys off this and nothing else.
  studyMode: boolean;
};

let cached: KioskSession | null = null;

export async function loadKioskSession(): Promise<KioskSession | null> {
  if (cached) return cached;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: device } = await supabase
    .from("kiosk_devices")
    .select("id, center_id, device_label")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (!device) return null;

  // Phase gate: read this center's study_mode (Phase 0 = false). Defaults to
  // false if the row can't be read, so study UI never appears by accident.
  const { data: center } = await supabase
    .from("centers")
    .select("study_mode")
    .eq("id", device.center_id)
    .maybeSingle();

  // The operator is recorded at sign-in time (staff enters their id on the
  // login screen); stored alongside the device row in app storage.
  const operatorStaffId = (await import("@react-native-async-storage/async-storage"))
    .default.getItem("operator_staff_id");

  cached = {
    deviceId: device.id,
    centerId: device.center_id,
    deviceLabel: device.device_label,
    operatorStaffId: (await operatorStaffId) ?? "",
    studyMode: center?.study_mode === true,
  };
  return cached;
}

export function clearKioskSession(): void {
  cached = null;
}

// Product telemetry (§5): aggregate only, no health values, no identifiers.
export async function track(event: string, metadata?: Record<string, string | number | boolean>) {
  const s = await loadKioskSession();
  if (!s) return;
  try {
    await supabase.from("telemetry_events").insert({
      center_id: s.centerId,
      event_type: event,
      platform: "kiosk",
      metadata: metadata ?? null,
    });
  } catch {
    // never let telemetry break a capture
  }
}
