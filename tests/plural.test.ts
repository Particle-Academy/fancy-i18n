import { describe, expect, it } from "vitest";
import { choose, pluralForms, pluralIndex, resolveBuiltinLocale, BUILTIN_LOCALES } from "../src";

describe("plural table: normalisation", () => {
  it("reads a hyphen as an underscore and falls back to the language subtag", () => {
    // Stock Laravel matches the exact string, so es-MX would get ONE form there.
    expect(pluralIndex("es-MX", 2)).toBe(1);
    expect(pluralIndex("es_MX", 2)).toBe(1);
    expect(pluralIndex("pt-BR", 2)).toBe(1);
    expect(pluralIndex("ru-RU", 5)).toBe(2);
  });

  it("is case-insensitive on the language", () => {
    expect(pluralIndex("RU", 5)).toBe(2);
  });

  it("gives unknown languages one form, as Laravel's default does", () => {
    expect(pluralForms("rhg-Rohg")).toBe(1);
    expect(pluralForms("xx")).toBe(1);
  });

  it("knows the form counts of the five built-in locales", () => {
    expect(pluralForms("en")).toBe(2);
    expect(pluralForms("es")).toBe(2);
    expect(pluralForms("de")).toBe(2);
    expect(pluralForms("ru")).toBe(3);
    expect(pluralForms("zh-Hans")).toBe(1);
    expect(pluralForms("pl")).toBe(3);
    expect(pluralForms("ar")).toBe(6);
  });
});

describe("plural table: host overrides", () => {
  it("takes a function for a language neither Laravel nor CLDR covers", () => {
    const rules = { "rhg-Rohg": (n: number) => (n === 1 ? 0 : 1) };
    expect(pluralIndex("rhg-Rohg", 1, rules)).toBe(0);
    expect(pluralIndex("rhg-Rohg", 4, rules)).toBe(1);
    expect(choose("one|many", 4, "rhg-Rohg", rules)).toBe("many");
  });

  it("takes another locale's rule by name, or 'one' for a single form", () => {
    expect(pluralIndex("ksw", 5, { ksw: "ru" })).toBe(2);
    expect(pluralIndex("de", 5, { de: "one" })).toBe(0);
  });

  it("matches an override on the exact tag before the language", () => {
    const rules = { "ksw-Mymr": "ru", ksw: "one" } as const;
    expect(pluralIndex("ksw-Mymr", 5, rules)).toBe(2);
    expect(pluralIndex("ksw_mymr", 5, rules)).toBe(2);
    expect(pluralIndex("ksw", 5, rules)).toBe(0);
  });

  it("falls back to the table when an override names a rule that does not exist", () => {
    expect(pluralIndex("ru", 5, { ru: "qqq" })).toBe(2);
    expect(pluralIndex("ru", 5, { ru: "qqq-x" })).toBe(2);
  });
});

describe("built-in locales", () => {
  it("are the five the owner chose", () => {
    expect(BUILTIN_LOCALES).toEqual(["en", "es", "de", "ru", "zh-Hans"]);
  });

  it("alias Simplified Chinese and never alias Traditional", () => {
    for (const tag of ["zh", "zh-CN", "zh_CN", "zh-SG", "zh-Hans", "zh-Hans-CN"]) expect(resolveBuiltinLocale(tag), tag).toBe("zh-Hans");
    for (const tag of ["zh-TW", "zh-HK", "zh-Hant", "zh-Hant-TW"]) expect(resolveBuiltinLocale(tag), tag).toBeUndefined();
  });

  it("resolve regional tags to their language", () => {
    expect(resolveBuiltinLocale("es-MX")).toBe("es");
    expect(resolveBuiltinLocale("de_AT")).toBe("de");
    expect(resolveBuiltinLocale("en-GB")).toBe("en");
    expect(resolveBuiltinLocale("ru")).toBe("ru");
    expect(resolveBuiltinLocale("pl")).toBeUndefined();
  });
});
