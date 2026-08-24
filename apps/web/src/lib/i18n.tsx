"use client";

// Locale state for the whole app. English is the default; a saved choice or a
// ?lang= query overrides it, and the choice persists per device (localStorage)
// so a center can set a device to 한국어 once and it stays. Any missing string in
// a locale falls back to English (see copy.ts deepMerge).

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { DICT, DEFAULT_LOCALE, type Copy, type Locale } from "./copy";

const KEY = "strainx.lang";

type Ctx = { locale: Locale; setLocale: (l: Locale) => void; copy: Copy };
const LocaleCtx = createContext<Ctx>({
  locale: DEFAULT_LOCALE,
  setLocale: () => {},
  copy: DICT[DEFAULT_LOCALE],
});

function isLocale(v: string | null): v is Locale {
  return v === "en" || v === "ko" || v === "es" || v === "zh";
}

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLoc] = useState<Locale>(DEFAULT_LOCALE);

  useEffect(() => {
    const url = new URLSearchParams(window.location.search).get("lang");
    const saved = typeof localStorage !== "undefined" ? localStorage.getItem(KEY) : null;
    const initial = isLocale(url) ? url : isLocale(saved) ? saved : DEFAULT_LOCALE;
    setLoc(initial);
    document.documentElement.lang = initial;
  }, []);

  const setLocale = (l: Locale) => {
    setLoc(l);
    try { localStorage.setItem(KEY, l); } catch { /* private mode */ }
    document.documentElement.lang = l;
  };

  return (
    <LocaleCtx.Provider value={{ locale, setLocale, copy: DICT[locale] }}>
      {children}
    </LocaleCtx.Provider>
  );
}

export function useLocale() {
  return useContext(LocaleCtx);
}

/** The active-language copy object. Use in place of the old `COPY` import. */
export function useCopy(): Copy {
  return useContext(LocaleCtx).copy;
}
