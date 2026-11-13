import { canon, language } from "./locales";

/**
 * [index of the segment for a non-negative number n (i is n truncated, PHP's
 * (int) cast), number of forms (0: unknown, a host function decides)].
 */
export type PluralRule = readonly [(n: number, i: number) => number, number];

/**
 * A host override for one locale: a function from the count to a segment
 * index, or the name of a rule to borrow, which is either "one" (a single
 * form) or any locale the table knows ("ru", "fr", "pl", ...).
 */
export type PluralRuleSpec = string | ((n: number) => number);
export type PluralRules = Readonly<Record<string, PluralRuleSpec>>;

/**
 * Laravel's MessageSelector::getPluralIndex as data (Laravel 13.34.0, itself
 * from Zend Framework, new BSD). Each rule is keyed by a representative
 * language; the languages sharing it are listed in LANGUAGES. Laravel lists
 * region variants (de_AT, es_MX, ...) one by one and every one shares its
 * language's rule, so the table is by language, and the kit falls back from
 * the full tag to the language, which stock Laravel does not.
 */
const RULES: Record<string, PluralRule> = {
  one: [() => 0, 1],
  en: [(n) => (n == 1 ? 0 : 1), 2],
  fr: [(n) => (n == 0 || n == 1 ? 0 : 1), 2],
  ru: [(n, i) => (i % 10 == 1 && i % 100 != 11 ? 0 : i % 10 >= 2 && i % 10 <= 4 && (i % 100 < 10 || i % 100 >= 20) ? 1 : 2), 3],
  cs: [(n) => (n == 1 ? 0 : n >= 2 && n <= 4 ? 1 : 2), 3],
  ga: [(n) => (n == 1 ? 0 : n == 2 ? 1 : 2), 3],
  lt: [(n, i) => (i % 10 == 1 && i % 100 != 11 ? 0 : i % 10 >= 2 && (i % 100 < 10 || i % 100 >= 20) ? 1 : 2), 3],
  sl: [(n, i) => (i % 100 == 1 ? 0 : i % 100 == 2 ? 1 : i % 100 == 3 || i % 100 == 4 ? 2 : 3), 4],
  mk: [(n, i) => (i % 10 == 1 ? 0 : 1), 2],
  mt: [(n, i) => (n == 1 ? 0 : n == 0 || (i % 100 > 1 && i % 100 < 11) ? 1 : i % 100 > 10 && i % 100 < 20 ? 2 : 3), 4],
  lv: [(n, i) => (n == 0 ? 0 : i % 10 == 1 && i % 100 != 11 ? 1 : 2), 3],
  pl: [(n, i) => (n == 1 ? 0 : i % 10 >= 2 && i % 10 <= 4 && (i % 100 < 12 || i % 100 > 14) ? 1 : 2), 3],
  cy: [(n) => (n == 1 ? 0 : n == 2 ? 1 : n == 8 || n == 11 ? 2 : 3), 4],
  ro: [(n, i) => (n == 1 ? 0 : n == 0 || (i % 100 > 0 && i % 100 < 20) ? 1 : 2), 3],
  ar: [(n, i) => (n == 0 ? 0 : n == 1 ? 1 : n == 2 ? 2 : i % 100 >= 3 && i % 100 <= 10 ? 3 : i % 100 >= 11 ? 4 : 5), 6],
};

const LANGUAGES: Record<string, string> = {
  one: "az bo dz id ja jv ka km kn ko ms th tr vi zh",
  en: "af bn bg ca da de el en eo es et eu fa fi fo fur fy gl gu ha he hu is it ku lb ml mn mr nah nb ne nl nn no om or pa pap ps pt so sq sv sw ta te tk ur zu",
  fr: "am bh fil fr gun hi hy ln mg nso ti wa xbr",
  ru: "be bs hr ru sr uk",
  cs: "cs sk",
};

const BY_LANGUAGE: Record<string, PluralRule> = Object.create(null);
// Rule names are keys too ("one" is no language Laravel knows, so it adds nothing else).
for (const r in RULES) for (const l of (r + " " + (LANGUAGES[r] ?? "")).split(" ")) if (l) BY_LANGUAGE[l] = RULES[r]!;

const fromSpec = (spec: PluralRuleSpec | undefined): PluralRule | undefined =>
  typeof spec == "function" ? [spec, 0] : spec ? BY_LANGUAGE[canon(spec)] ?? BY_LANGUAGE[language(spec)] : undefined;

/**
 * The rule for a locale: a host override on the exact tag (hyphen and
 * underscore read alike, any case), then an override on the language, then the
 * table by language, then Laravel's default, index 0 (a single form).
 */
export function pluralRule(locale: string, rules?: PluralRules): PluralRule {
  const c = canon(locale);
  const l = language(locale);
  let exact: PluralRuleSpec | undefined;
  let lang: PluralRuleSpec | undefined;
  for (const k in rules) {
    const kc = canon(k);
    if (kc == c) exact = rules[k];
    else if (kc == l) lang = rules[k];
  }
  return fromSpec(exact) ?? fromSpec(lang) ?? BY_LANGUAGE[l] ?? BY_LANGUAGE.one!;
}

/**
 * Laravel's getPluralIndex for `locale` and `number` (its absolute value), with
 * the kit's normalisation and optional host overrides.
 *
 * A language neither Laravel nor the host knows gets index 0, i.e. one form.
 * That is a fallback, not a statement about the language: Rohingya (rhg) has no
 * rule in Laravel or in CLDR 48 and is UNKNOWN until a native speaker says.
 */
export function pluralIndex(locale: string, number: number, rules?: PluralRules): number {
  const n = Math.abs(number);
  return pluralRule(locale, rules)[0](n, Math.trunc(n));
}

/** How many plural forms the locale's rule has; 0 when a host function decides. */
export const pluralForms = (locale: string, rules?: PluralRules): number => pluralRule(locale, rules)[1];
