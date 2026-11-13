import { canon, language, packServes } from "./locales";
import { pluralRule, type PluralRule, type PluralRules } from "./plural";

/**
 * Where a pack string came from. The same labels fancy-translations' export
 * manifest uses, so its import reads a pack's meta directly:
 * - `machine`: translated by an agent, not yet reviewed by a speaker;
 * - `community`: accepted through fancy-translations;
 * - `maintainer`: written or approved by a maintainer.
 * A pack update never overwrites a `community` or `maintainer` key.
 */
export type Origin = "machine" | "community" | "maintainer";

export interface FancyI18nPack {
  /** The locale the pack is written in: "es", "zh-Hans". It serves that tag and its regions. */
  readonly locale: string;
  /** Flat key to text, in Laravel's format. */
  readonly messages: Readonly<Record<string, string>>;
  /** Per key: its origin, and the hash of the English it was translated from. */
  readonly meta?: Readonly<Record<string, { readonly origin: Origin; readonly sourceHash?: string }>>;
}

export interface CatalogOptions {
  /** An opaque BCP 47 tag. Used for plurals and Intl only; never to infer direction. */
  locale: string;
  /** Host strings, flat `{ key: text }`, e.g. an Inertia `lang` prop. They win over packs. */
  strings?: Readonly<Record<string, string>>;
  /** Bundled packs, in priority order. Only packs serving `locale` are used. */
  packs?: readonly FancyI18nPack[];
  /** Plural overrides per locale, for languages neither Laravel nor CLDR covers. */
  pluralRules?: PluralRules;
  /** Which locale Intl formats with, e.g. `{ ksw: "my" }`. Exact tag, then language. */
  formatLocale?: Readonly<Record<string, string>>;
  /** Called once per key when a non-English locale falls back to English. Runs in production too. */
  onMissingKey?: (key: string, locale: string) => void;
}

/** Which tier a label resolved from. */
export type Tier = "labels" | "host" | "pack" | "default";

export interface Resolution {
  text: string;
  from: Tier;
  /** The locale the text is written in: "en" for the English default. */
  locale: string;
  /** A pack key's origin, when its pack carries meta. */
  origin?: Origin;
}

/**
 * The value the provider puts in context. Its shape is a protocol between
 * installed copies of fancy-i18n (they share one context), so it only grows.
 */
export interface FancyCatalog {
  readonly protocol: 1;
  readonly locale: string;
  /** The locale Intl formats with, after `formatLocale`. */
  readonly formatLocale: string;
  /** This locale's plural rule. */
  readonly plural: PluralRule;
  /** Host or pack text for a key; undefined when neither has a non-empty string. */
  text(key: string): string | undefined;
  /** Where `text(key)` came from. */
  from(key: string): Resolution | undefined;
  /** Report a key that fell back to English. Deduplicated per key. */
  missing(key: string): void;
}

/** An own, non-empty string, or undefined. "constructor" is never a translation. */
const own = (o: Readonly<Record<string, string>> | undefined, k: string): string | undefined =>
  (o && Object.prototype.hasOwnProperty.call(o, k) && o[k]) || undefined;

/** Build a catalog without React: for SSR helpers, tests and non-React hosts. */
export function createFancyCatalog(options: CatalogOptions): FancyCatalog {
  const { locale, strings, onMissingKey } = options;
  const packs = (options.packs ?? []).filter((p) => packServes(p.locale, locale));
  const c = canon(locale);
  const lang = language(locale);
  const reported = new Set<string>();
  const pack = (key: string) => packs.find((p) => own(p.messages, key));
  const map = options.formatLocale ?? {};
  let formatLocale = locale;
  for (const k in map) if (canon(k) == c || (formatLocale == locale && canon(k) == lang)) formatLocale = map[k]!;
  return {
    protocol: 1,
    locale,
    formatLocale,
    plural: pluralRule(locale, options.pluralRules),
    text: (key) => own(strings, key) ?? (packs.length ? own(pack(key)?.messages, key) : undefined),
    from(key) {
      const h = own(strings, key);
      if (h) return { text: h, from: "host", locale };
      const p = pack(key);
      const origin = p?.meta?.[key]?.origin;
      if (p) return { text: p.messages[key]!, from: "pack", locale, ...(origin && { origin }) };
    },
    missing(key) {
      if (lang != "en" && !reported.has(key)) {
        reported.add(key);
        onMissingKey?.(key, locale);
      }
    },
  };
}
