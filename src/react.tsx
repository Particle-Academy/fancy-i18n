import { useContext, useMemo, useRef, type ReactNode } from "react";
import { createFancyCatalog, type CatalogOptions, type FancyCatalog } from "./catalog";
import { FancyI18nContext } from "./context";
import { createTranslator, type FancyT, type Labels, type Messages } from "./translator";

export interface FancyI18nProviderProps extends CatalogOptions {
  /**
   * A content hash for `strings`. While it is unchanged (for the same locale),
   * a new `strings` object is ignored and the previous one kept, so a host
   * handing a fresh prop on every Inertia visit re-renders nothing.
   */
  version?: string | number;
  children?: ReactNode;
}

type Rec = Readonly<Record<string, unknown>> | undefined;
const sameRecord = (a: Rec, b: Rec) => {
  if (a === b) return true;
  if (!a || !b) return false;
  const k = Object.keys(a);
  return k.length == Object.keys(b).length && k.every((x) => a[x] === b[x]);
};

/** Keep the previous value while `same` says the new one is equal. */
function useSame<T>(value: T, same: (a: T, b: T) => boolean): T {
  const ref = useRef(value);
  if (!same(ref.current, value)) ref.current = value;
  return ref.current;
}

/**
 * Supplies the locale, host strings and packs to every Fancy component below
 * it. Renders no DOM, sets no `dir`, never fetches. Its value is memoised on
 * its inputs: a parent re-render, an inline `packs` array, an inline
 * `pluralRules` / `formatLocale` object or a new `onMissingKey` function does
 * not re-render a single consumer.
 */
export function FancyI18nProvider({ locale, strings, version, packs, pluralRules, formatLocale, onMissingKey, children }: FancyI18nProviderProps) {
  const miss = useRef(onMissingKey);
  miss.current = onMissingKey;
  const pinned = useSame(
    { locale, version, strings },
    (a, b) => a.strings === b.strings || (b.version !== undefined && a.version === b.version && a.locale === b.locale),
  ).strings;
  const p = useSame(packs, sameRecord as (a: unknown, b: unknown) => boolean);
  const r = useSame(pluralRules, sameRecord);
  const f = useSame(formatLocale, sameRecord);
  const value = useMemo(
    () => createFancyCatalog({ locale, strings: pinned, packs: p, pluralRules: r, formatLocale: f, onMissingKey: (k, l) => miss.current?.(k, l) }),
    [locale, pinned, p, r, f],
  );
  return <FancyI18nContext.Provider value={value}>{children}</FancyI18nContext.Provider>;
}

// Translators without labels are shared: one per (catalog, defaults), so a
// component mounting a thousand times builds its t once.
const shared = new WeakMap<object, WeakMap<Messages, FancyT<Messages>>>();
const NONE = {};

/**
 * One context read per component, and nothing else: no memo, no allocation on
 * the shared path. `defaults` is the component's frozen English object;
 * `labels` are per-instance overrides (existing label props), which win, and
 * build a translator for that render.
 */
export function useFancyT<M extends Messages>(defaults: M, labels?: Labels<M>): FancyT<M> {
  const catalog = useContext(FancyI18nContext);
  if (labels) return createTranslator(defaults, catalog, labels);
  const k = catalog ?? NONE;
  let byDefaults = shared.get(k);
  if (!byDefaults) shared.set(k, (byDefaults = new WeakMap()));
  let t = byDefaults.get(defaults);
  if (!t) byDefaults.set(defaults, (t = createTranslator(defaults, catalog)));
  return t as FancyT<M>;
}

export type { FancyCatalog };
