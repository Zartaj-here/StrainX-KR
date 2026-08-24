// Kiosk locale state. English is the default; a device's choice is stored in
// AsyncStorage so a center can set a kiosk to 한국어 once and it stays. Missing
// keys in a locale fall back to English (copy.ts deepMerge).

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
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
    AsyncStorage.getItem(KEY)
      .then((v) => { if (isLocale(v)) setLoc(v); })
      .catch(() => {});
  }, []);

  const setLocale = (l: Locale) => {
    setLoc(l);
    AsyncStorage.setItem(KEY, l).catch(() => {});
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
