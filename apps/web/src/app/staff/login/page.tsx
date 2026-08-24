"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useCopy } from "@/lib/i18n";
import { supabaseBrowser } from "@/lib/supabase/client";

export default function StaffLogin() {
  const COPY = useCopy();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(false);
  const router = useRouter();

  const signIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(false);
    const { error: err } = await supabaseBrowser().auth.signInWithPassword({ email, password });
    if (err) { setError(true); return; }
    router.replace("/staff/today");
    router.refresh();
  };

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-4 p-6">
      <h1 className="text-2xl font-bold">{COPY.staff.login}</h1>
      <form onSubmit={signIn} className="flex flex-col gap-3">
        <input
          type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
          placeholder={COPY.staff.email}
          className="rounded-lg border border-stone-300 px-4 py-3"
        />
        <input
          type="password" required value={password} onChange={(e) => setPassword(e.target.value)}
          placeholder={COPY.staff.password}
          className="rounded-lg border border-stone-300 px-4 py-3"
        />
        <button type="submit" className="rounded-lg bg-amber-600 px-4 py-3 font-bold text-white">
          {COPY.staff.signIn}
        </button>
        {error && <p className="text-red-700">{COPY.common.error}</p>}
      </form>
    </main>
  );
}
