"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { lsGet, lsSet } from "./safeStorage";
import { dict, type Lang } from "./dict";

export const LANGS: { code: Lang; label: string; short: string; htmlLang: string; locale: string }[] = [
  { code: "en", label: "English", short: "EN", htmlLang: "en", locale: "en-US" },
  { code: "zh", label: "中文", short: "中文", htmlLang: "zh-CN", locale: "zh-CN" },
  { code: "id", label: "Bahasa Indonesia", short: "ID", htmlLang: "id", locale: "id-ID" },
];

type Vars = Record<string, string | number>;
interface Ctx {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (key: string, vars?: Vars) => string;
  money: (n: number, currency?: string) => string;
  date: (iso: string, opts?: Intl.DateTimeFormatOptions) => string;
}

const I18nCtx = createContext<Ctx | null>(null);
const STORAGE_KEY = "lunas.lang";

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>("en"); // English is the primary language

  useEffect(() => {
    const saved = lsGet(STORAGE_KEY) as Lang | null;
    if (saved && saved in dict) setLangState(saved);
  }, []);

  useEffect(() => {
    document.documentElement.lang = LANGS.find((l) => l.code === lang)!.htmlLang;
  }, [lang]);

  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    lsSet(STORAGE_KEY, l);
  }, []);

  const value = useMemo<Ctx>(() => {
    const locale = LANGS.find((l) => l.code === lang)!.locale;
    const t = (key: string, vars?: Vars) => {
      let s = dict[lang][key] ?? dict.en[key] ?? key;
      if (vars) for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, String(v));
      return s;
    };
    const money = (n: number, currency = "USD") =>
      new Intl.NumberFormat(locale, { style: "currency", currency, minimumFractionDigits: 2 }).format(n);
    const date = (iso: string, opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" }) =>
      new Intl.DateTimeFormat(locale, opts).format(new Date(iso));
    return { lang, setLang, t, money, date };
  }, [lang, setLang]);

  return <I18nCtx.Provider value={value}>{children}</I18nCtx.Provider>;
}

export function useI18n() {
  const ctx = useContext(I18nCtx);
  if (!ctx) throw new Error("useI18n must be used inside <I18nProvider>");
  return ctx;
}
