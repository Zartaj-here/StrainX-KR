"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useCopy } from "@/lib/i18n";
import { supabaseBrowser } from "@/lib/supabase/client";

// Three screens in Phase 0. If we build a fourth, they will not use it (§9).
export default function StaffLayout({ children }: { children: React.ReactNode }) {
  const COPY = useCopy();
  const pathname = usePathname();
  const TABS = [
    { href: "/staff/today", label: COPY.staff.nav.today },
    { href: "/staff/activities", label: COPY.staff.nav.activities },
    { href: "/staff/weekly", label: COPY.staff.nav.weekly },
  ];
  // The study/export link is Phase 1 only — hidden unless this center is in
  // study_mode, so the Phase 0 dashboard stays exactly three screens.
  const [studyMode, setStudyMode] = useState(false);
  useEffect(() => {
    (async () => {
      const sb = supabaseBrowser();
      const { data: { user } } = await sb.auth.getUser();
      if (!user) return;
      const { data: st } = await sb.from("staff").select("center_id").eq("auth_user_id", user.id).maybeSingle();
      if (!st) return;
      const { data: c } = await sb.from("centers").select("study_mode").eq("id", st.center_id).maybeSingle();
      setStudyMode(c?.study_mode === true);
    })();
  }, []);

  if (pathname === "/staff/login") return <>{children}</>;

  return (
    <div className="mx-auto min-h-screen max-w-4xl">
      <nav className="sticky top-0 z-10 flex items-center gap-1 border-b border-stone-200 bg-white p-2">
        {TABS.map((t) => (
          <Link
            key={t.href}
            href={t.href}
            className={`rounded-lg px-4 py-2 font-semibold ${
              pathname.startsWith(t.href) ? "bg-amber-600 text-white" : "text-stone-600 hover:bg-stone-100"
            }`}
          >
            {t.label}
          </Link>
        ))}
        {/* Secondary: occasional enrollment/admin, deliberately not a primary
            daily tab so the three daily screens stay uncluttered (§9). */}
        <Link
          href="/staff/people"
          className={`ml-auto rounded-lg px-3 py-2 text-sm ${
            pathname.startsWith("/staff/people")
              ? "bg-stone-700 text-white"
              : "text-stone-500 hover:bg-stone-100"
          }`}
        >
          {COPY.staff.navPeople}
        </Link>
        {studyMode ? (
          <Link
            href="/staff/records"
            className={`rounded-lg px-3 py-2 text-sm ${
              pathname.startsWith("/staff/records")
                ? "bg-stone-700 text-white"
                : "text-stone-500 hover:bg-stone-100"
            }`}
          >
            {COPY.staff.navStudy}
          </Link>
        ) : null}
      </nav>
      <div className="p-4">{children}</div>
    </div>
  );
}
