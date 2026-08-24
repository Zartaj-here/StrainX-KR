// Bootstrap a center for Phase 0. There is no self-serve admin UI and no
// researcher role in Phase 0 (by design), so a center, its staff, and its 6
// kiosk devices are provisioned here with the Supabase SERVICE ROLE key. This
// mints the auth users (which plain SQL can't) and links them to staff /
// kiosk_devices rows so the app's RLS helpers resolve.
//
// It never sets study_mode — that is a deliberate, separate act performed only
// with an ethics approval reference in hand (Phase 1).
//
// Usage:
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
//   node scripts/provision.mjs --center "햇살 데이케어 센터" \
//        --staff-email staff@example.com --staff-password 'pw' \
//        --staff-name "김선생" --kiosks 6
//
// Prints the created ids. Re-runnable: existing auth users are reused by email.

import { createClient } from "@supabase/supabase-js";
import { parseArgs } from "node:util";

const { values } = parseArgs({
  options: {
    center: { type: "string" },
    "staff-email": { type: "string" },
    "staff-password": { type: "string" },
    "staff-name": { type: "string", default: "직원" },
    kiosks: { type: "string", default: "6" },
    "kiosk-password": { type: "string", default: "kiosk-" + "changeme" },
  },
});

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the environment.");
  process.exit(1);
}
if (!values.center || !values["staff-email"] || !values["staff-password"]) {
  console.error("Required: --center, --staff-email, --staff-password");
  process.exit(1);
}

const admin = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

async function ensureAuthUser(email, password) {
  // Try to create; if the email exists, look it up instead.
  const { data, error } = await admin.auth.admin.createUser({
    email, password, email_confirm: true,
  });
  if (!error) return data.user.id;
  const { data: list } = await admin.auth.admin.listUsers({ perPage: 1000 });
  const found = list?.users?.find((u) => u.email === email);
  if (found) return found.id;
  throw error;
}

async function main() {
  // Center
  const { data: center, error: cErr } = await admin
    .from("centers")
    .insert({ name: values.center, timezone: "Asia/Seoul" })
    .select("id")
    .single();
  if (cErr) throw cErr;
  console.log("center:", center.id);

  // Staff
  const staffUid = await ensureAuthUser(values["staff-email"], values["staff-password"]);
  const { data: staff, error: sErr } = await admin
    .from("staff")
    .insert({ center_id: center.id, auth_user_id: staffUid, display_name: values["staff-name"], role: "admin" })
    .select("id")
    .single();
  if (sErr) throw sErr;
  console.log("staff:", staff.id, `(login: ${values["staff-email"]})`);

  // Kiosk devices
  const n = parseInt(values.kiosks, 10);
  for (let i = 1; i <= n; i++) {
    const email = `kiosk${i}.${center.id.slice(0, 8)}@kiosk.local`;
    const uid = await ensureAuthUser(email, values["kiosk-password"]);
    const { data: dev, error: dErr } = await admin
      .from("kiosk_devices")
      .insert({ center_id: center.id, device_label: `키오스크 ${i}`, auth_user_id: uid })
      .select("id")
      .single();
    if (dErr) throw dErr;
    console.log(`kiosk ${i}:`, dev.id, `(login: ${email})`);
  }

  console.log("\nDone. study_mode is FALSE (Phase 0). Sign the staff account in on");
  console.log("the dashboard, then enroll members under 어르신 관리.");
}

main().catch((e) => { console.error(e); process.exit(1); });
