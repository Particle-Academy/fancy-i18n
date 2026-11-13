import { useContext } from "react";
import type { FancyCatalog } from "./catalog";
import { boundedSet, limits } from "./internal";
import { FancyI18nContext } from "./context";

type DateInput = Date | number;
type Width = "long" | "short" | "narrow";

/**
 * Cached Intl formatters for one locale. Constructing an Intl formatter costs
 * 30 to 40 format calls (plan 4.2), so each (kind, options) pair is built once
 * and kept, up to `formatterCacheSize`. Lives apart from the translator so a
 * component that never formats does not ship it.
 */
export interface FancyFormat {
  /** The locale Intl is given; undefined means the runtime default. */
  readonly locale: string | undefined;
  number(value: number, options?: Intl.NumberFormatOptions): string;
  /** 1.5K, 2M: compact notation. */
  compact(value: number): string;
  /** A byte count in localised units. Base 1024 unless `base: 1000`. */
  bytes(value: number, options?: { base?: 1000 | 1024; maximumFractionDigits?: number }): string;
  date(value: DateInput, options?: Intl.DateTimeFormatOptions): string;
  /** Hour and minute, plus any options given. */
  time(value: DateInput, options?: Intl.DateTimeFormatOptions): string;
  relative(value: number, unit: Intl.RelativeTimeFormatUnit, options?: Intl.RelativeTimeFormatOptions): string;
  list(items: readonly string[], options?: Intl.ListFormatOptions): string;
  displayName(code: string, options: Intl.DisplayNamesOptions): string | undefined;
  /** The twelve month names, January first. */
  months(width?: Width): string[];
  /** The seven weekday names, Sunday first. */
  weekdays(width?: Width): string[];
}

const UNITS = ["byte", "kilobyte", "megabyte", "gigabyte", "terabyte", "petabyte"];

export function createFormat(locale: string | undefined): FancyFormat {
  const cache = new Map<string, any>(); // eslint-disable-line @typescript-eslint/no-explicit-any
  const get = (kind: string, options?: object) => {
    const id = kind + JSON.stringify(options);
    return cache.get(id) ?? boundedSet(cache, id, new (Intl as any)[kind](locale, options), limits.formatterCacheSize); // eslint-disable-line @typescript-eslint/no-explicit-any
  };
  const names = (kind: string, width: Width, count: number, at: (i: number) => Date): string[] => {
    const id = kind + width;
    if (!cache.has(id)) {
      const f = get("DateTimeFormat", { [kind]: width, timeZone: "UTC" });
      boundedSet(cache, id, Array.from({ length: count }, (_, i) => f.format(at(i))), limits.formatterCacheSize);
    }
    return cache.get(id);
  };
  return {
    locale,
    number: (v, o) => get("NumberFormat", o).format(v),
    compact: (v) => get("NumberFormat", { notation: "compact" }).format(v),
    bytes(v, o = {}) {
      const base = o.base ?? 1024;
      let i = 0;
      while (Math.abs(v) >= base && i < 5) (v /= base), i++;
      return get("NumberFormat", { style: "unit", unit: UNITS[i], maximumFractionDigits: o.maximumFractionDigits ?? 1 }).format(v);
    },
    date: (v, o) => get("DateTimeFormat", o).format(v),
    time: (v, o) => get("DateTimeFormat", { hour: "numeric", minute: "2-digit", ...o }).format(v),
    relative: (v, u, o) => get("RelativeTimeFormat", o).format(v, u),
    list: (items, o) => get("ListFormat", o).format(items),
    displayName: (code, o) => get("DisplayNames", o).of(code),
    // 2026-01-04 (UTC) is a Sunday.
    months: (w = "long") => names("month", w, 12, (i) => new Date(Date.UTC(2026, i, 15))),
    weekdays: (w = "long") => names("weekday", w, 7, (i) => new Date(Date.UTC(2026, 0, 4 + i))),
  };
}

const formats = new WeakMap<object, FancyFormat>();
const RUNTIME = {};

/** The cached format for a catalog (its `formatLocale`), or the runtime default for null. */
export function formatFor(catalog: FancyCatalog | null): FancyFormat {
  const key = catalog ?? RUNTIME;
  let f = formats.get(key);
  if (!f) formats.set(key, (f = createFormat(catalog?.formatLocale)));
  return f;
}

/** Cached Intl formatters for the provider's locale; the runtime default without one. */
export const useFancyFormat = (): FancyFormat => formatFor(useContext(FancyI18nContext));
