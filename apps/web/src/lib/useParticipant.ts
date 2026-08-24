"use client";

// Participant identity for the PWA. The phone signs in anonymously on first
// open; staff links it to a participant with a 6-digit pairing code. After
// that, RLS scopes every query to her own rows.

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client";

export type Me = {
  id: string;
  display_name: string;
  voice_enabled: boolean;
  checkin_mode: string;
};

export function useParticipant(): { me: Me | null; loading: boolean } {
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    const supabase = supabaseBrowser();
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        const { error } = await supabase.auth.signInAnonymously();
        if (error) { setLoading(false); return; }
      }
      const { data } = await supabase.rpc("get_my_participant");
      const row = Array.isArray(data) ? data[0] : data;
      if (!row) {
        router.replace("/pair");
        return;
      }
      setMe(row as Me);
      setLoading(false);
    })();
  }, [router]);

  return { me, loading };
}
