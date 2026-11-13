import { createElement, Fragment, type ReactNode } from "react";
import type { FancyCatalog, Resolution } from "./catalog";
import { warnOnce } from "./internal";
import { chooseWith, replaceParts, type Values } from "./message";
import { pluralRule } from "./plural";

export type Messages = Readonly<Record<string, string>>;

/**
 * A per-instance override: a string, or a function of the values (a plural
 * call passes `count` in them). Undefined means "no override".
 */
export type LabelValue = string | ((values: Values) => string) | undefined;
export type Labels<M extends Messages> = { readonly [K in keyof M]?: LabelValue };

export type TagFn = (children: ReactNode) => ReactNode;

export interface FancyT<M extends Messages> {
  /** The text for `key`, with `:name` placeholders filled from `values`. */
  (key: keyof M & string, values?: Values): string;
  /** A Laravel pipe plural: conditions first, then the locale's plural index. Sets `:count`. */
  choice(key: keyof M & string, count: number | readonly unknown[], values?: Values): string;
  /**
   * The text as React nodes: `<b>...</b>` pairs filled by `tags.b`, React
   * nodes allowed as values, numbers wrapped in `<bdi dir="ltr">` so they
   * read correctly inside right-to-left text. Never parses HTML.
   */
  nodes(key: keyof M & string, values?: Values, tags?: Readonly<Record<string, TagFn>>): ReactNode;
  /** The text and the tier it came from: labels, host, pack or default. */
  resolve(key: keyof M & string): Resolution;
  /** The provider's locale, or "en" without one. */
  readonly locale: string;
}

/** Freeze a component's English defaults, typed so `t()` takes only its keys. */
export const defineMessages = <const M extends Messages>(messages: M): M => Object.freeze(messages);

const EN = pluralRule("en");

// Inline, not a helper: a bundler that replaces process.env.NODE_ENV can then
// drop each warning, message and all, from a production build.
// typeof process != "undefined" && process.env.NODE_ENV !== "production"

/**
 * Build `t` over a component's English defaults, an optional catalog (the
 * provider's) and optional per-instance labels. Lookup: labels, host strings,
 * packs, English. Never the raw key, never a blank from a lang file.
 */
export function createTranslator<M extends Messages>(defaults: M, catalog: FancyCatalog | null, labels?: Labels<M>): FancyT<M> {
  const locale = catalog ? catalog.locale : "en";
  // Tier of the last lookup: 0 labels, 1 host or pack, 2 English default.
  let tier = 0;
  const get = (key: string): LabelValue => {
    const l = labels?.[key];
    if (l !== undefined) return (tier = 0), l;
    const c = catalog?.text(key);
    if (c !== undefined) return (tier = 1), c;
    tier = 2;
    if (catalog) {
      catalog.missing(key);
      if (typeof process != "undefined" && process.env.NODE_ENV !== "production" && !locale.toLowerCase().startsWith("en"))
        warnOnce(locale + " " + key, `No ${locale} text for "${key}"; showing English. Add it to the host strings or a pack.`);
    }
    // Only a string counts: an inherited Object property ("constructor") is a function.
    const d = defaults[key];
    if (typeof d == "string") return d;
    if (typeof process != "undefined" && process.env.NODE_ENV !== "production")
      warnOnce(" " + key, `"${key}" is not in this component's defaults. This is a bug in the component.`);
    return "";
  };

  const t = ((key: string, values?: Values) => {
    const s = get(key);
    return typeof s == "function" ? s(values ?? {}) : values ? replaceParts(s!, values) : s;
  }) as FancyT<M>;

  t.choice = (key, count, values) => {
    const n = typeof count == "number" ? count : count.length;
    const v = values && "count" in values ? values : { ...values, count: n };
    const s = get(key);
    if (typeof s == "function") return s(v);
    // English text takes English plural rules, whatever the page locale.
    const rule = tier == 2 || !catalog ? EN : catalog.plural;
    const seg = chooseWith(s!, n, rule, (have, want) => {
      if (typeof process != "undefined" && process.env.NODE_ENV !== "production" && want)
        warnOnce(locale + "|" + key, `"${key}" has ${have} plural forms; ${tier == 2 ? "en" : locale} needs ${want}. Using the first.`);
    });
    return replaceParts(seg, v);
  };

  t.nodes = (key, values, tags) => {
    const s = get(key);
    const text = typeof s == "function" ? s(values ?? {}) : s!;
    if (!values && !tags) return text;
    const parts = (line: string): ReactNode[] =>
      (values ? replaceParts(line, values, true) : [line]).map((p) =>
        typeof p == "number" || typeof p == "bigint" ? createElement("bdi", { dir: "ltr" }, String(p)) : (p as ReactNode),
      );
    const names = tags && Object.keys(tags).map((n) => n.replace(/[^\w-]/g, "")).join("|");
    const render = (line: string): ReactNode[] => {
      const m = names ? new RegExp(`<(${names})>(.*?)</\\1>`).exec(line) : null;
      if (!m) return parts(line);
      return [
        ...parts(line.slice(0, m.index)),
        tags![m[1]!]!(createElement(Fragment, null, ...render(m[2]!))),
        ...render(line.slice(m.index + m[0].length)),
      ];
    };
    const out = render(text);
    return out.length == 1 && typeof out[0] == "string" ? out[0] : createElement(Fragment, null, ...out);
  };

  t.resolve = (key) => {
    const l = labels?.[key];
    if (l !== undefined) return { text: typeof l == "string" ? l : l({}), from: "labels", locale };
    return catalog?.from(key) ?? { text: get(key) as string, from: "default", locale: "en" };
  };

  (t as { locale: string }).locale = locale;
  return t;
}
