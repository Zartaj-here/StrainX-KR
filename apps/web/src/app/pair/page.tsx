"use client";

// First-open pairing: the phone shows a 6-digit code; staff enters it on the
// dashboard, linking this device's anonymous auth user to a participant.

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useCopy } from "@/lib/i18n";
import { supabaseBrowser } from "@/lib/supabase/client";

export default function PairPage() {
  const COPY = useCopy();
  const [code, setCode] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const router = useRouter();
  const polling = useRef<ReturnType<typeof setInterval> | null>(null);

  const mint = async () => {
    setError(false);
    const supabase = supabaseBrowser();
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) await supabase.auth.signInAnonymously();
    const { data, error: err } = await supabase.rpc("create_pairing_code");
    if (err) { setError(true); return; }
    setCode(data as string);
  };

  useEffect(() => {
    void mint();
    // Poll until staff claims the code, then head to check-in.
    polling.current = setInterval(async () => {
      const { data } = await supabaseBrowser().rpc("get_my_participant");
      const row = Array.isArray(data) ? data[0] : data;
      if (row) {
        if (polling.current) clearInterval(polling.current);
        router.replace("/checkin");
      }
    }, 3000);
    return () => { if (polling.current) clearInterval(polling.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <main className="senior mx-auto flex min-h-screen max-w-md flex-col items-center gap-6 p-6 text-center">
      <h1 className="font-bold">{COPY.pair.title}</h1>
      <p>{COPY.pair.explain}</p>
      {code && (
        <div className="rounded-2xl border-4 border-amber-400 bg-white px-8 py-6 text-6xl font-black tracking-[0.3em]">
          {code}
        </div>
      )}
      {error && <p className="text-red-700">{COPY.common.error}</p>}
      <p className="text-stone-500">{COPY.pair.waiting}</p>
      <button onClick={() => void mint()} className="rounded-2xl bg-stone-200 px-6 py-4 font-bold text-stone-600">
        {COPY.pair.retry}
      </button>
    </main>
  );
}
