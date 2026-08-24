"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client";

export type StaffMe = { id: string; center_id: string; display_name: string };

export function useStaff(): { staff: StaffMe | null; loading: boolean } {
  const [staff, setStaff] = useState<StaffMe | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    (async () => {
      const supabase = supabaseBrowser();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.replace("/staff/login"); return; }
      const { data } = await supabase
        .from("staff")
        .select("id, center_id, display_name")
        .eq("auth_user_id", user.id)
        .maybeSingle();
      if (!data) { router.replace("/staff/login"); return; }
      setStaff(data);
      setLoading(false);
    })();
  }, [router]);

  return { staff, loading };
}
