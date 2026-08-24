"use client";

// Member editor (build item 7). Five sections:
//  - Profile: name, photo, phone platform, check-in mode
//  - Kiosk assignment: WRITE-ONCE (Invariant 9; DB trigger refuses a change)
//  - Care consent: self-consent / legal rep, and consent flags
//  - Care baseline: ADL, af_flag, beta_blocker (the key covariate), meds.
//    Each save APPENDS a new care_baseline row so history is preserved.
//  - Emergency contacts: human-initiated escalation only (Invariant 3);
//    nothing automated ever reads this.

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useCopy } from "@/lib/i18n";
import { useStaff } from "@/lib/useStaff";
import { supabaseBrowser } from "@/lib/supabase/client";

type Participant = {
  id: string;
  display_name: string;
  photo_url: string | null;
  platform: "ios" | "android" | null;
  checkin_mode: "self" | "self_nudge" | "staff";
  voice_enabled: boolean;
  assigned_kiosk_device_id: string | null;
  capacity_self_consent: boolean | null;
  legal_rep: { name?: string; relationship?: string; phone?: string } | null;
  consent_flags: { care_records?: boolean; photo?: boolean; voice?: boolean } | null;
  withdrawn_at: string | null;
};
type Device = { id: string; device_label: string };
type Contact = { id?: string; name: string; relationship: string; phone: string; share_opt_in: boolean };

const card = "rounded-2xl border border-stone-200 bg-white p-5 flex flex-col gap-3";
const label = "font-semibold text-stone-700";
const input = "rounded-lg border border-stone-300 px-3 py-2";

export default function PersonEditor() {
  const COPY = useCopy();
  const { staff, loading } = useStaff();
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params.id;

  const [p, setP] = useState<Participant | null>(null);
  const [devices, setDevices] = useState<Device[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [msg, setMsg] = useState("");

  // Care baseline working copy (latest values; save appends a new row).
  const [adl, setAdl] = useState("");
  const [af, setAf] = useState(false);
  const [beta, setBeta] = useState(false);
  const [rate, setRate] = useState(false);
  const [anti, setAnti] = useState(false);
  const [meds, setMeds] = useState("");

  const load = useCallback(async () => {
    if (!staff) return;
    const supabase = supabaseBrowser();
    const { data: person } = await supabase
      .from("participants")
      .select("id, display_name, photo_url, platform, checkin_mode, voice_enabled, assigned_kiosk_device_id, capacity_self_consent, legal_rep, consent_flags, withdrawn_at")
      .eq("id", id)
      .maybeSingle();
    setP(person as Participant);

    const { data: devs } = await supabase
      .from("kiosk_devices")
      .select("id, device_label")
      .eq("center_id", staff.center_id)
      .order("device_label");
    setDevices((devs as Device[]) ?? []);

    const { data: base } = await supabase
      .from("care_baseline")
      .select("adl_score, af_flag, beta_blocker, rate_control, anticholinergic, meds")
      .eq("participant_id", id)
      .order("measured_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (base) {
      setAdl(base.adl_score?.toString() ?? "");
      setAf(base.af_flag ?? false);
      setBeta(base.beta_blocker ?? false);
      setRate(base.rate_control ?? false);
      setAnti(base.anticholinergic ?? false);
      setMeds(Array.isArray(base.meds) ? base.meds.join("\n") : "");
    }

    const { data: ec } = await supabase
      .from("emergency_contacts")
      .select("id, name, relationship, phone, share_opt_in")
      .eq("participant_id", id)
      .order("created_at");
    setContacts((ec as Contact[]) ?? []);
  }, [staff, id]);

  useEffect(() => { void load(); }, [load]);

  if (loading || !staff) return <p className="p-8">{COPY.common.loading}</p>;
  if (!p) return <p className="p-8">{COPY.common.loading}</p>;

  const flash = (m: string) => { setMsg(m); setTimeout(() => setMsg(""), 2000); };
  const patch = (fields: Partial<Participant>) => setP((prev) => (prev ? { ...prev, ...fields } : prev));

  const saveProfile = async () => {
    const supabase = supabaseBrowser();
    // assigned_kiosk_device_id is only sent when currently unset (write-once);
    // the DB trigger refuses a change regardless, this just avoids the error.
    const payload: Record<string, unknown> = {
      display_name: p.display_name,
      photo_url: p.photo_url || null,
      platform: p.platform,
      checkin_mode: p.checkin_mode,
      voice_enabled: p.consent_flags?.voice ?? p.voice_enabled,
      capacity_self_consent: p.capacity_self_consent,
      legal_rep: p.legal_rep,
      consent_flags: p.consent_flags,
    };
    if (!p.assigned_kiosk_device_id) {
      // leave as-is (null) — set separately via the kiosk picker below
    }
    const { error } = await supabase.from("participants").update(payload).eq("id", id);
    flash(error ? COPY.common.error : COPY.staff.people.saved);
  };

  const assignKiosk = async (deviceId: string) => {
    if (p.assigned_kiosk_device_id) return; // write-once
    const { error } = await supabaseBrowser()
      .from("participants")
      .update({ assigned_kiosk_device_id: deviceId })
      .eq("id", id);
    if (error) { flash(COPY.common.error); return; }
    patch({ assigned_kiosk_device_id: deviceId });
    flash(COPY.staff.people.saved);
  };

  const saveBaseline = async () => {
    const medsArr = meds.split("\n").map((s) => s.trim()).filter(Boolean);
    const { error } = await supabaseBrowser().from("care_baseline").insert({
      participant_id: id,
      adl_score: adl ? parseInt(adl, 10) : null,
      af_flag: af,
      beta_blocker: beta,
      rate_control: rate,
      anticholinergic: anti,
      meds: medsArr,
    });
    flash(error ? COPY.common.error : COPY.staff.people.saved);
  };

  const saveContacts = async () => {
    const supabase = supabaseBrowser();
    for (const c of contacts) {
      if (!c.name.trim() || !c.phone.trim()) continue;
      if (c.id) {
        await supabase.from("emergency_contacts").update({
          name: c.name, relationship: c.relationship, phone: c.phone, share_opt_in: c.share_opt_in,
        }).eq("id", c.id);
      } else {
        await supabase.from("emergency_contacts").insert({
          participant_id: id, name: c.name, relationship: c.relationship,
          phone: c.phone, share_opt_in: c.share_opt_in,
        });
      }
    }
    flash(COPY.staff.people.saved);
    await load();
  };

  const removeContact = async (c: Contact, idx: number) => {
    if (c.id) await supabaseBrowser().from("emergency_contacts").delete().eq("id", c.id);
    setContacts((cs) => cs.filter((_, i) => i !== idx));
  };

  const toggleWithdraw = async () => {
    const now = p.withdrawn_at ? null : new Date().toISOString();
    if (!p.withdrawn_at && !confirm(COPY.staff.people.confirmWithdraw)) return;
    await supabaseBrowser().from("participants").update({ withdrawn_at: now }).eq("id", id);
    patch({ withdrawn_at: now });
    flash(COPY.staff.people.saved);
  };

  const cf = p.consent_flags ?? {};
  const lr = p.legal_rep ?? {};

  return (
    <main className="flex flex-col gap-5">
      <div className="flex items-center gap-3">
        <Link href="/staff/people" className="text-stone-500">‹ {COPY.common.back}</Link>
        <h1 className="text-2xl font-bold">{p.display_name}</h1>
        {msg && <span className="ml-auto text-green-700">{msg}</span>}
      </div>

      {/* Profile */}
      <section className={card}>
        <label className={label}>{COPY.staff.people.name}</label>
        <input className={input} value={p.display_name} onChange={(e) => patch({ display_name: e.target.value })} />
        <label className={label}>{COPY.staff.people.photoUrl}</label>
        <input className={input} value={p.photo_url ?? ""} onChange={(e) => patch({ photo_url: e.target.value })} />
        <label className={label}>{COPY.staff.people.platform}</label>
        <select className={input} value={p.platform ?? ""} onChange={(e) => patch({ platform: (e.target.value || null) as Participant["platform"] })}>
          <option value="">—</option>
          <option value="ios">{COPY.staff.people.platformOpts.ios}</option>
          <option value="android">{COPY.staff.people.platformOpts.android}</option>
        </select>
        <label className={label}>{COPY.staff.people.checkinMode}</label>
        <select className={input} value={p.checkin_mode} onChange={(e) => patch({ checkin_mode: e.target.value as Participant["checkin_mode"] })}>
          <option value="self">{COPY.staff.people.checkinModeOpts.self}</option>
          <option value="self_nudge">{COPY.staff.people.checkinModeOpts.self_nudge}</option>
          <option value="staff">{COPY.staff.people.checkinModeOpts.staff}</option>
        </select>
        <button onClick={() => void saveProfile()} className="self-start rounded-lg bg-amber-600 px-4 py-2 font-semibold text-white">
          {COPY.staff.people.save}
        </button>
      </section>

      {/* Kiosk assignment — write-once */}
      <section className={card}>
        <label className={label}>{COPY.staff.people.kiosk}</label>
        <p className="text-sm text-stone-500">{COPY.staff.people.kioskFixed}</p>
        {p.assigned_kiosk_device_id ? (
          <p className="font-semibold">
            {devices.find((d) => d.id === p.assigned_kiosk_device_id)?.device_label
              ?? p.assigned_kiosk_device_id.slice(0, 8)}
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            <span className="self-center text-stone-500">{COPY.staff.people.kioskNone}:</span>
            {devices.map((d) => (
              <button key={d.id} onClick={() => void assignKiosk(d.id)}
                className="rounded-lg border border-stone-300 px-3 py-2 hover:bg-amber-50">
                {d.device_label}
              </button>
            ))}
          </div>
        )}
      </section>

      {/* Care consent */}
      <section className={card}>
        <h2 className={label}>{COPY.staff.people.consentTitle}</h2>
        <Check checked={p.capacity_self_consent ?? false} onChange={(v) => patch({ capacity_self_consent: v })} text={COPY.staff.people.consentSelf} />
        <Check checked={cf.care_records ?? false} onChange={(v) => patch({ consent_flags: { ...cf, care_records: v } })} text={COPY.staff.people.consentRecords} />
        <Check checked={cf.photo ?? false} onChange={(v) => patch({ consent_flags: { ...cf, photo: v } })} text={COPY.staff.people.consentPhoto} />
        <Check checked={cf.voice ?? false} onChange={(v) => patch({ consent_flags: { ...cf, voice: v } })} text={COPY.staff.people.consentVoice} />
        <p className="text-sm text-stone-500">{COPY.staff.people.consentVoiceNote}</p>

        {!p.capacity_self_consent && (
          <div className="mt-2 flex flex-col gap-2 rounded-lg bg-stone-50 p-3">
            <h3 className={label}>{COPY.staff.people.legalRepTitle}</h3>
            <input className={input} placeholder={COPY.staff.people.legalRepName} value={lr.name ?? ""} onChange={(e) => patch({ legal_rep: { ...lr, name: e.target.value } })} />
            <input className={input} placeholder={COPY.staff.people.legalRepRel} value={lr.relationship ?? ""} onChange={(e) => patch({ legal_rep: { ...lr, relationship: e.target.value } })} />
            <input className={input} placeholder={COPY.staff.people.legalRepPhone} value={lr.phone ?? ""} onChange={(e) => patch({ legal_rep: { ...lr, phone: e.target.value } })} />
          </div>
        )}
        <button onClick={() => void saveProfile()} className="self-start rounded-lg bg-amber-600 px-4 py-2 font-semibold text-white">
          {COPY.staff.people.save}
        </button>
      </section>

      {/* Care baseline */}
      <section className={card}>
        <h2 className={label}>{COPY.staff.people.baselineTitle}</h2>
        <label className={label}>{COPY.staff.people.adl}</label>
        <input className={input} inputMode="numeric" value={adl} onChange={(e) => setAdl(e.target.value.replace(/\D/g, ""))} />
        <Check checked={af} onChange={setAf} text={COPY.staff.people.afFlag} />
        <p className="text-sm text-stone-500">{COPY.staff.people.afNote}</p>
        <Check checked={beta} onChange={setBeta} text={COPY.staff.people.betaBlocker} strong />
        <p className="text-sm text-amber-700">{COPY.staff.people.betaNote}</p>
        <Check checked={rate} onChange={setRate} text={COPY.staff.people.rateControl} />
        <Check checked={anti} onChange={setAnti} text={COPY.staff.people.anticholinergic} />
        <label className={label}>{COPY.staff.people.meds}</label>
        <textarea className={`${input} h-28`} placeholder={COPY.staff.people.medsPlaceholder} value={meds} onChange={(e) => setMeds(e.target.value)} />
        <button onClick={() => void saveBaseline()} className="self-start rounded-lg bg-amber-600 px-4 py-2 font-semibold text-white">
          {COPY.staff.people.save}
        </button>
      </section>

      {/* Emergency contacts */}
      <section className={card}>
        <h2 className={label}>{COPY.staff.people.contactsTitle}</h2>
        <p className="text-sm text-stone-500">{COPY.staff.people.contactsNote}</p>
        {contacts.map((c, i) => (
          <div key={c.id ?? `new-${i}`} className="flex flex-col gap-2 rounded-lg bg-stone-50 p-3">
            <input className={input} placeholder={COPY.staff.people.contactName} value={c.name}
              onChange={(e) => setContacts((cs) => cs.map((x, j) => j === i ? { ...x, name: e.target.value } : x))} />
            <input className={input} placeholder={COPY.staff.people.contactRel} value={c.relationship}
              onChange={(e) => setContacts((cs) => cs.map((x, j) => j === i ? { ...x, relationship: e.target.value } : x))} />
            <input className={input} placeholder={COPY.staff.people.contactPhone} value={c.phone}
              onChange={(e) => setContacts((cs) => cs.map((x, j) => j === i ? { ...x, phone: e.target.value } : x))} />
            <Check checked={c.share_opt_in} onChange={(v) => setContacts((cs) => cs.map((x, j) => j === i ? { ...x, share_opt_in: v } : x))} text={COPY.staff.people.contactShare} />
            <button onClick={() => void removeContact(c, i)} className="self-start text-sm text-stone-500 underline">
              {COPY.staff.people.removeContact}
            </button>
          </div>
        ))}
        <div className="flex gap-2">
          <button onClick={() => setContacts((cs) => [...cs, { name: "", relationship: "", phone: "", share_opt_in: false }])}
            className="rounded-lg border border-stone-300 px-4 py-2 font-semibold text-stone-600">
            {COPY.staff.people.addContact}
          </button>
          <button onClick={() => void saveContacts()} className="rounded-lg bg-amber-600 px-4 py-2 font-semibold text-white">
            {COPY.staff.people.save}
          </button>
        </div>
      </section>

      <button onClick={() => void toggleWithdraw()}
        className="self-start rounded-lg border border-stone-300 px-4 py-2 text-stone-500">
        {p.withdrawn_at ? COPY.staff.people.restore : COPY.staff.people.withdraw}
      </button>
    </main>
  );
}

function Check({ checked, onChange, text, strong }: {
  checked: boolean; onChange: (v: boolean) => void; text: string; strong?: boolean;
}) {
  return (
    <label className={`flex items-center gap-3 ${strong ? "font-bold" : ""}`}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)}
        className="h-6 w-6 accent-amber-600" />
      <span>{text}</span>
    </label>
  );
}
