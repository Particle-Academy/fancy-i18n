import { boundedSet, limits, stats, templates, type Compiled } from "./internal";
import { pluralRule, type PluralRule, type PluralRules } from "./plural";

export type Values = Readonly<Record<string, unknown>>;

function compiled(line: string): Compiled {
  return templates.get(line) ?? boundedSet(templates, line, {}, limits.templateCacheSize);
}

/** PHP's string cast for the scalars a replacement can hold. */
const str = (v: unknown): string => (v == null || v === false ? "" : v === true ? "1" : String(v));
/** Str::upper, i.e. mb_strtoupper: full case mapping (straße to STRASSE). */
const upper = (s: string) => s.toUpperCase();
/** Str::ucfirst: the first code point upper-cased, the rest untouched. */
const ucfirst = (s: string) => {
  const c = s ? String.fromCodePoint(s.codePointAt(0)!) : "";
  return upper(c) + s.slice(c.length);
};

/**
 * Laravel's Translator::makeReplacements, faithfully: each value v for key k
 * fills ":k" with v, ":K" with ucfirst(v) and ":KEY" with upper(v), in ONE
 * strtr pass, so the longest key wins at each position (":counts" with
 * { count: 5 } is "5s"). The line is split on ":" once and cached; a line with
 * no ":" is returned as it is.
 *
 * `asParts` returns the pieces instead of joining them, with each raw value
 * left as given (so a number or a React node survives); variants are strings.
 */
export function replaceParts(line: string, values: Values, asParts: true): unknown[];
export function replaceParts(line: string, values: Values, asParts?: false): string;
export function replaceParts(line: string, values: Values, asParts?: boolean): string | unknown[] {
  if (line.indexOf(":") < 0) return asParts ? [line] : line;
  const map: Record<string, unknown> = Object.create(null);
  let any = false;
  for (const k in values) {
    const v = values[k];
    const s = str(v);
    map[ucfirst(k)] = ucfirst(s);
    map[upper(k)] = upper(s);
    map[k] = asParts ? v : s;
    any = true;
  }
  if (!any) return asParts ? [line] : line;
  const c = compiled(line);
  const tails = c.c ?? ((stats.compiles++, (c.c = line.split(":"))));
  const out: unknown[] = [tails[0]];
  for (let i = 1; i < tails.length; i++) {
    const tail = tails[i]!;
    let best: string | undefined;
    for (const k in map) if ((best === undefined || k.length > best.length) && tail.startsWith(k)) best = k;
    if (best === undefined) out.push(":" + tail);
    else out.push(map[best], tail.slice(best.length));
  }
  return asParts ? out : out.join("");
}

/** Laravel's makeReplacements: `:name`, `:Name`, `:NAME`, one strtr pass. */
export function makeReplacements(line: string, values?: Values): string {
  return values ? replaceParts(line, values) : line;
}

/**
 * PHP 8's loose comparison of a number with a string: numeric, else as strings.
 * `s` is always part of a condition, so it only holds -?0-9|*,. and no regex
 * is needed: in that alphabet, PHP's is_numeric and a finite Number() agree.
 */
function cmp(n: number, s: string): number {
  if (s !== "" && Number.isFinite(Number(s))) return n - Number(s);
  const a = String(n);
  return a < s ? -1 : a > s ? 1 : 0;
}

// Linear on untrusted text: anchored at ^, and the class cannot contain the
// closing } or ], so there is exactly one way to match and nothing to retry.
// The same holds for the strip in chooseWith. tests/hostile-input.test.tsx.
const CONDITION = /^[{[]([-?\d|*,.]*)[}\]]([\s\S]*)/;

/** MessageSelector::extractFromString. */
function extract(part: string, n: number): string | undefined {
  const m = CONDITION.exec(part);
  if (!m) return;
  const cond = m[1]!;
  const comma = cond.indexOf(",");
  if (comma >= 0) {
    const from = cond.slice(0, comma);
    const to = cond.slice(comma + 1);
    if ((to === "*" && cmp(n, from) >= 0) || (from === "*" && cmp(n, to) <= 0) || (cmp(n, from) >= 0 && cmp(n, to) <= 0)) return m[2];
  }
  return cmp(n, cond) === 0 ? m[2] : undefined;
}

/** The characters PHP's trim() strips: space, tab, newline, carriage return, NUL, vertical tab. */
const trimmable = (c: number) => c == 32 || c == 9 || c == 10 || c == 13 || c == 0 || c == 11;

/**
 * PHP's trim(), as a linear scan from each end. Not a regex: the text is
 * translated, so untrusted, and `[ws]+$` rescans every whitespace run to its
 * end from each position (quadratic; 8 s on 100,000 characters).
 */
function phpTrim(s: string): string {
  let a = 0;
  let b = s.length;
  while (a < b && trimmable(s.charCodeAt(a))) a++;
  while (b > a && trimmable(s.charCodeAt(b - 1))) b--;
  return s.slice(a, b);
}

/**
 * MessageSelector::choose with a resolved rule. `onWrongForms` is called when
 * no condition matched and the line has more than one segment but not the
 * rule's number of forms (Laravel silently returns segment 0 if the index is
 * missing).
 */
export function chooseWith(line: string, n: number, rule: PluralRule, onWrongForms?: (have: number, want: number) => void): string {
  if (line.indexOf("|") < 0 && !CONDITION.test(line)) return line;
  const c = compiled(line);
  const segments = c.p ?? ((stats.compiles++, (c.p = line.split("|"))));
  for (const part of segments) {
    const v = extract(part, n);
    if (v !== undefined) return phpTrim(v);
  }
  const stripped = segments.map((p) => p.replace(/^[{[][-?\d|*,.]*[}\]]/, ""));
  if (onWrongForms && stripped.length > 1 && stripped.length !== rule[1]) onWrongForms(stripped.length, rule[1]);
  n = Math.abs(n);
  return stripped[rule[0](n, Math.trunc(n))] ?? stripped[0]!;
}

/**
 * Laravel's MessageSelector::choose: an explicit `{n}` / `[a,b]` / `[a,*]`
 * condition wins; otherwise the locale's plural index picks the segment, and a
 * missing index returns segment 0. `rules` are host overrides (see pluralIndex).
 */
export function choose(line: string, number: number, locale: string, rules?: PluralRules): string {
  return chooseWith(line, number, pluralRule(locale, rules));
}
