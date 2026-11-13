import { describe, expect, it } from "vitest";
import fixture from "../fixtures/laravel-format.json";
import { choose, makeReplacements, pluralIndex } from "../src";

type Values = Record<string, unknown>;

/**
 * The shared fixture. Every expected value in it was checked against Laravel's
 * own Translator::makeReplacements and MessageSelector (13.34.0) before this
 * port was written, and fancy-translations runs the same file in Pest.
 */
describe("shared Laravel-format fixture", () => {
  it.each(fixture.replace.map((c) => [c.name, c] as const))("replace: %s", (_name, c) => {
    expect(makeReplacements(c.line, c.values as Values)).toBe(c.expected);
  });

  it.each(fixture.choice.map((c) => [c.name, c] as const))("choice: %s", (_name, c) => {
    const values: Values = { ...((c as { values?: Values }).values ?? {}) };
    if (!("count" in values)) values.count = c.number;
    expect(makeReplacements(choose(c.line, c.number, c.locale), values)).toBe(c.expected);
  });

  it.each(fixture.pluralIndex.map((c) => [`${c.locale} ${c.number}`, c] as const))("plural index: %s", (_name, c) => {
    expect(pluralIndex(c.locale, c.number)).toBe(c.index);
  });

  it("covers the twelve locales the plan names, and the three normalisations", () => {
    const locales = new Set(fixture.pluralIndex.map((c) => c.locale));
    for (const l of ["en", "es", "de", "ru", "zh-Hans", "pl", "hi", "my", "hmn", "ksw", "rhg-Rohg", "ar", "es-MX", "ksw-Mymr"]) {
      expect(locales.has(l), l).toBe(true);
    }
  });
});
