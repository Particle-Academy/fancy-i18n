/**
 * Module state shared by the core. Not part of the public entry: tests import
 * it directly, and nothing in it is a contract.
 */

/** Every limit is a setting (configureFancyI18n). These are the defaults. */
export const limits = {
  /** Distinct message strings whose compiled form is kept. Cleared when full. */
  templateCacheSize: 2000,
  /** Distinct (kind, options) Intl formatters kept per locale. Cleared when full. */
  formatterCacheSize: 64,
  /** Distinct (locale, key) pairs remembered so a dev warning prints once. */
  warningMemory: 1000,
};

export interface FancyI18nLimits {
  templateCacheSize?: number;
  formatterCacheSize?: number;
  warningMemory?: number;
}

/** Change a limit. Values below 1 are ignored. */
export function configureFancyI18n(next: FancyI18nLimits): void {
  for (const k in next) {
    const v = next[k as keyof FancyI18nLimits];
    if (typeof v === "number" && v >= 1) limits[k as keyof FancyI18nLimits] = v;
  }
}

/** A Map that clears itself when it outgrows `max()`: O(1), no bookkeeping. */
export function boundedSet<V>(map: Map<string, V>, key: string, value: V, max: number): V {
  if (map.size >= max) map.clear();
  map.set(key, value);
  return value;
}

export interface Compiled {
  /** The line split on ":"; undefined until a replacement needs it. */
  c?: string[];
  /** The line split on "|"; undefined until a plural choice needs it. */
  p?: string[];
}

export const templates = new Map<string, Compiled>();

export const stats = {
  compiles: 0,
  cached: () => templates.size,
};

export function resetTemplateCache(): void {
  templates.clear();
}

/**
 * Dev builds only. Written so a bundler replacing process.env.NODE_ENV folds
 * the whole call away in production, and so a browser without `process`
 * never throws.
 */
export const isDev = (): boolean => typeof process != "undefined" && process.env.NODE_ENV !== "production";

const warned = new Map<string, 1>();

export function warnOnce(id: string, message: string): void {
  if (isDev() && !warned.has(id)) {
    boundedSet(warned, id, 1, limits.warningMemory);
    console.warn("[fancy-i18n] " + message);
  }
}

export function resetWarnings(): void {
  warned.clear();
}
