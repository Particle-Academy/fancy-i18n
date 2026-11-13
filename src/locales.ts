/** Lower case, hyphens only: "es_MX" and "es-mx" are the same tag. */
export const canon = (tag: string): string => tag.replace(/_/g, "-").toLowerCase();

/** The language subtag, lower case. */
export const language = (tag: string): string => canon(tag).split("-")[0]!;

/** The five locales the kit ships packs for (owner, 2026-11-07). */
export const BUILTIN_LOCALES = ["en", "es", "de", "ru", "zh-Hans"] as const;
export type BuiltinLocale = (typeof BUILTIN_LOCALES)[number];

/** zh, zh-CN and zh-SG read Simplified Chinese; zh-Hans is the pack's tag. */
const SIMPLIFIED = /^zh(-hans(-|$)|-cn$|-sg$|$)/;

/**
 * Which built-in pack serves a locale tag, or undefined when none does.
 * Traditional Chinese (zh-TW, zh-HK, zh-Hant) is never served Simplified.
 */
export function resolveBuiltinLocale(tag: string): BuiltinLocale | undefined {
  const c = canon(tag);
  if (SIMPLIFIED.test(c)) return "zh-Hans";
  const l = language(c);
  return l != "zh" && (BUILTIN_LOCALES as readonly string[]).includes(l) ? (l as BuiltinLocale) : undefined;
}

/**
 * Whether a pack written for `packLocale` serves `locale`: the same tag, or a
 * pack for a prefix of it ("es" serves "es-MX", never the reverse). The
 * Simplified Chinese aliases resolve first.
 */
export function packServes(packLocale: string, locale: string): boolean {
  const p = canon(packLocale);
  const c = SIMPLIFIED.test(canon(locale)) && !canon(locale).startsWith("zh-hans") ? "zh-hans" : canon(locale);
  return c == p || c.startsWith(p + "-");
}
