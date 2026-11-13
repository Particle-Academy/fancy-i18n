import { beforeEach, describe, expect, it } from "vitest";
import { configureFancyI18n, createFancyCatalog, createTranslator, defineMessages, formatFor, makeReplacements } from "../src";
import { resetTemplateCache, stats } from "../src/internal";

/**
 * Performance budget, part 2 (plan section 11): the guarantees that do not
 * depend on a clock. Part 1, reference identity, is in provider.test.tsx.
 */
const MESSAGES = defineMessages({
  "demo.plain": "Close",
  "demo.tpl": "Page :page of :pages",
  "demo.plural": ":count file|:count files",
});

beforeEach(() => {
  resetTemplateCache();
  configureFancyI18n({ templateCacheSize: 2000 });
});

describe("no building on the plain path", () => {
  it("t(key) with no values compiles nothing and returns the stored text unchanged", () => {
    const strings = { "demo.plain": "Cerrar" };
    const t = createTranslator(MESSAGES, createFancyCatalog({ locale: "es", strings }));
    const before = stats.compiles;
    for (let i = 0; i < 1000; i++) expect(t("demo.plain")).toBe(strings["demo.plain"]);
    expect(stats.compiles).toBe(before);
  });

  it("a string with no ':' skips parsing even when values are passed", () => {
    const before = stats.compiles;
    expect(makeReplacements("No colon here", { a: 1 })).toBe("No colon here");
    expect(stats.compiles).toBe(before);
  });
});

describe("templates are compiled once", () => {
  it("compiles a template once across many calls with different values", () => {
    const t = createTranslator(MESSAGES, null);
    const before = stats.compiles;
    for (let i = 0; i < 500; i++) t("demo.tpl", { page: i, pages: 500 });
    expect(stats.compiles - before).toBe(1);
  });

  it("parses a plural string once, and each chosen segment once, across many counts", () => {
    const t = createTranslator(MESSAGES, null);
    const before = stats.compiles;
    for (let i = 0; i < 500; i++) t.choice("demo.plural", i);
    // One split of the pipe string, plus one ":" split per segment it chose
    // (":count file" and ":count files"): 3, not 500.
    expect(stats.compiles - before).toBe(3);
  });

  it("bounds the template cache by a configurable size", () => {
    configureFancyI18n({ templateCacheSize: 10 });
    for (let i = 0; i < 50; i++) makeReplacements(`k${i} :a`, { a: 1 });
    expect(stats.cached()).toBeLessThanOrEqual(10);
  });
});

/** Swap an Intl constructor for a subclass that counts constructions. */
function counting(kind: "NumberFormat" | "DateTimeFormat") {
  const I = Intl as unknown as Record<string, new (...a: unknown[]) => object>;
  const original = I[kind]!;
  const counter = { n: 0, restore: () => void (I[kind] = original) };
  I[kind] = class extends original {
    constructor(...a: unknown[]) {
      super(...a);
      counter.n++;
    }
  };
  return counter;
}

describe("Intl formatters are constructed once per locale and options", () => {
  it("NumberFormat", () => {
    const c = counting("NumberFormat");
    try {
      const f = formatFor(createFancyCatalog({ locale: "de" }));
      for (let i = 0; i < 200; i++) f.number(i * 1000.5);
      for (let i = 0; i < 200; i++) f.number(i, { style: "percent" });
      expect(c.n).toBe(2);
      expect(f.number(1234.5)).toBe("1.234,5");
    } finally {
      c.restore();
    }
  });

  it("DateTimeFormat, including month and weekday names", () => {
    const c = counting("DateTimeFormat");
    try {
      const f = formatFor(createFancyCatalog({ locale: "es" }));
      const d = new Date(Date.UTC(2026, 0, 5, 12));
      for (let i = 0; i < 100; i++) f.date(d);
      for (let i = 0; i < 100; i++) f.months();
      expect(c.n).toBe(2);
    } finally {
      c.restore();
    }
  });

  it("bounds the formatter cache by a configurable size", () => {
    configureFancyI18n({ formatterCacheSize: 3 });
    const c = counting("NumberFormat");
    try {
      const f = formatFor(createFancyCatalog({ locale: "en" }));
      for (let d = 0; d < 6; d++) f.number(1, { maximumFractionDigits: d });
      for (let d = 0; d < 6; d++) f.number(1, { maximumFractionDigits: d });
      // Six distinct option sets through a cache of three: rebuilt, never grown.
      expect(c.n).toBeGreaterThan(6);
    } finally {
      c.restore();
      configureFancyI18n({ formatterCacheSize: 64 });
    }
  });

  it("one catalog has one format object", () => {
    const cat = createFancyCatalog({ locale: "es" });
    expect(formatFor(cat)).toBe(formatFor(cat));
    expect(formatFor(null)).toBe(formatFor(null));
  });
});
