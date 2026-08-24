"use client";

// Member list (build item 7). Enroll a new member or open one to edit their
// profile, care consent, care baseline, kiosk assignment, and emergency
// contacts. Care data, staff-owned. Withdrawing keeps every record (the
// handoff: empty days must read as absence, not disengagement).

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useCopy } from "@/lib/i18n";
import { useStaff } from "@/lib/useStaff";
import { supabaseBrowser } from "@/lib/supabase/client";

type P = { id: string; display_name: string; withdrawn_at: string | null };

export default function PeoplePage() {
  const COPY = useCopy();
  const { staff, loading } = useStaff();
  const [people, setPeople] = useState<P[]>([]);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");

  const load = useCallback(async () => {
    if (!staff) return;
    const { data } = await supabaseBrowser()
      .from("participants")
      .select("id, display_name, withdrawn_at")
      .eq("center_id", staff.center_id)
      .order("display_name");
    setPeople((data as P[]) ?? []);
  }, [staff]);

  useEffect(() => { void load(); }, [load]);

  if (loading || !staff) return <p className="p-8">{COPY.common.loading}</p>;

  const add = async () => {
    if (!name.trim()) return;
    await supabaseBrowser().from("participants").insert({
      center_id: staff.center_id,
      display_name: name.trim(),
    });
    setName("");
    setAdding(false);
    await load();
  };

  const enrolled = people.filter((p) => !p.withdrawn_at);
  const withdrawn = people.filter((p) => p.withdrawn_at);

  return (
    <main className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{COPY.staff.people.title}</h1>
        <button onClick={() => setAdding((v) => !v)} className="rounded-lg bg-amber-600 px-4 py-2 font-semibold text-white">
          {COPY.staff.people.add}
        </button>
      </div>

      {adding && (
        <div className="flex gap-2 rounded-xl border border-stone-200 bg-white p-3">
          <input
            value={name} onChange={(e) => setName(e.target.value)}
            placeholder={COPY.staff.people.name}
            className="flex-1 rounded-lg border border-stone-300 px-3 py-2"
          />
          <button onClick={() => void add()} className="rounded-lg bg-amber-600 px-4 py-2 font-semibold text-white">
            {COPY.staff.people.save}
          </button>
        </div>
      )}

      <section>
        <h2 className="mb-2 font-bold text-stone-600">{COPY.staff.people.enrolled} ({enrolled.length})</h2>
        <ul className="grid gap-2">
          {enrolled.map((p) => (
            <li key={p.id}>
              <Link href={`/staff/people/${p.id}`}
                className="flex items-center justify-between rounded-xl border border-stone-200 bg-white p-3 hover:bg-stone-50">
                <span className="text-lg font-semibold">{p.display_name}</span>
                <span className="text-stone-400">›</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      {withdrawn.length > 0 && (
        <section>
          <h2 className="mb-2 font-bold text-stone-400">{COPY.staff.people.withdrawn} ({withdrawn.length})</h2>
          <ul className="grid gap-2">
            {withdrawn.map((p) => (
              <li key={p.id}>
                <Link href={`/staff/people/${p.id}`}
                  className="flex items-center justify-between rounded-xl border border-stone-100 bg-stone-50 p-3 text-stone-500">
                  <span className="font-semibold">{p.display_name}</span>
                  <span>›</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
