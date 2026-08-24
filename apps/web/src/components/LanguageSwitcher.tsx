"use client";

// Compact language picker. A native <select> so it's accessible and works as a
// large, familiar control for elderly users too. Shown app-wide (participant +
// staff) via the root layout.

import { LOCALES, type Locale } from "@/lib/copy";
import { useLocale } from "@/lib/i18n";

export function LanguageSwitcher({ className = "" }: { className?: string }) {
  const { locale, setLocale } = useLocale();
  return (
    <select
      aria-label="Language / 언어 / Idioma / 语言"
      value={locale}
      onChange={(e) => setLocale(e.target.value as Locale)}
      className={`rounded-lg border border-stone-300 bg-white/90 px-2 py-1 text-sm text-stone-700 shadow-sm ${className}`}
    >
      {LOCALES.map((l) => (
        <option key={l.code} value={l.code}>{l.label}</option>
      ))}
    </select>
  );
}
