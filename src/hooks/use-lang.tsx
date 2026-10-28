import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Lang } from "@/lib/ration";
import { translate, type Args, type I18nKey } from "@/lib/i18n";

const STORAGE_KEY = "nr_lang_v1";

type LangContextValue = {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: <K extends I18nKey>(key: K, ...args: Args<K>) => string;
  bi: (en: string, ta: string) => string;
};

const LangContext = createContext<LangContextValue | null>(null);

export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>("en");

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored === '"ta"' || stored === "ta") setLangState("ta");
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(l));
    } catch {
      /* ignore */
    }
  }, []);

  const value = useMemo<LangContextValue>(
    () => ({
      lang,
      setLang,
      t: (key, ...args) => translate(lang, key, ...args),
      bi: (en: string, ta: string) => (lang === "ta" ? ta : en),
    }),
    [lang, setLang],
  );

  return <LangContext.Provider value={value}>{children}</LangContext.Provider>;
}

export function useLang() {
  const ctx = useContext(LangContext);
  if (!ctx) throw new Error("useLang must be used inside LangProvider");
  return ctx;
}
