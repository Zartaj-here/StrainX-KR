// Open the phase gate for a center — the deliberate, service-role act the
// schema is designed for (0006: "flipping study_mode is a deliberate service-
// role act performed with the ethics approval reference in hand"). This does
// NOT bypass the gate: it satisfies the Postgres CHECK by writing a real
// ethics_approval_ref + ethics_approved_at, exactly as intended.
//
// Two modes:
//   Real approval (production):
//     node scripts/set-study-mode.mjs --center <uuid> \
//          --ethics-ref "IRB-2026-0142" --approved-at 2026-08-01
//
//   POC / code review BEFORE approval (writes an explicit placeholder that says
//   so, so nobody can mistake it for a real approval):
//     node scripts/set-study-mode.mjs --center <uuid> --poc
//
// The POC placeholder is honest by construction. Never point a POC center at
// real participants; collect real data only under a genuine approval ref.
//
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/set-study-mode.mjs ...

import { createClient } from "@supabase/supabase-js";
import { parseArgs } from "node:util";

const POC_REF = "POC-DEV — NOT AN APPROVAL — NO REAL PARTICIPANT DATA";

const { values } = parseArgs({
  options: {
    center: { type: "string" },
    "ethics-ref": { type: "string" },
    "approved-at": { type: "string" },
    poc: { type: "boolean", default: false },
    off: { type: "boolean", default: false }, // return a center to Phase 0
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

async function main() {
  if (values.off) {
    const { error } = await admin.from("centers").update({ study_mode: false }).eq("id", values.center);
    if (error) throw error;
    console.log(`Center ${values.center} returned to Phase 0 (study_mode = false).`);
    return;
  }

  let ref = values["ethics-ref"];
  let approvedAt = values["approved-at"];

  if (values.poc) {
    ref = POC_REF;
    approvedAt = approvedAt ?? new Date().toISOString();
    console.warn("\n⚠  POC MODE — opening the gate with a PLACEHOLDER approval reference.");
    console.warn("   This is for code review only. Do NOT collect real participant data.\n");
  } else {
    if (!ref || !approvedAt) {
      console.error("Real approval requires --ethics-ref and --approved-at (or use --poc for a code-review POC).");
      process.exit(1);
    }
  }

  const { data, error } = await admin
    .from("centers")
    .update({ study_mode: true, ethics_approval_ref: ref, ethics_approved_at: approvedAt })
    .eq("id", values.center)
    .select("id, name, study_mode, ethics_approval_ref, ethics_approved_at")
    .single();

  // The DB CHECK is the real guard: if ref/date are missing it rejects here.
  if (error) throw error;
  console.log("study_mode is now TRUE for:");
  console.log(`  center:      ${data.name} (${data.id})`);
  console.log(`  approval:    ${data.ethics_approval_ref}`);
  console.log(`  approved_at: ${data.ethics_approved_at}`);
}

main().catch((e) => { console.error(e.message ?? e); process.exit(1); });
