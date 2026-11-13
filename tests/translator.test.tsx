import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import {
  createFancyCatalog,
  createTranslator,
  defineMessages,
  type FancyI18nPack,
} from "../src";
import { resetWarnings } from "../src/internal";

const MESSAGES = defineMessages({
  "demo.modal.close": "Close",
  "demo.list.items": ":count item|:count items",
  "demo.list.summary": "Showing :from to :to of :total",
  "demo.rich.saved": "Saved <b>:name</b> just now",
});

const ES: FancyI18nPack = {
  locale: "es",
  messages: { "demo.modal.close": "Cerrar (pack)", "demo.list.items": ":count elemento|:count elementos" },
  meta: { "demo.modal.close": { origin: "machine", sourceHash: "abc" } },
};

let warn: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  resetWarnings();
  warn = vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe("defaults", () => {
  it("are frozen", () => {
    expect(Object.isFrozen(MESSAGES)).toBe(true);
  });

  it("without a catalog, t(key) is the English default", () => {
    const t = createTranslator(MESSAGES, null);
    expect(t("demo.modal.close")).toBe("Close");
    expect(t.locale).toBe("en");
  });
});

describe("fallback order: labels, host strings, packs, English", () => {
  it("host strings beat a pack on the same key (Bridge requirement 2)", () => {
    const cat = createFancyCatalog({ locale: "es", strings: { "demo.modal.close": "Cerrar (host)" }, packs: [ES] });
    expect(createTranslator(MESSAGES, cat)("demo.modal.close")).toBe("Cerrar (host)");
  });

  it("a pack beats English", () => {
    const cat = createFancyCatalog({ locale: "es", packs: [ES] });
    expect(createTranslator(MESSAGES, cat)("demo.modal.close")).toBe("Cerrar (pack)");
  });

  it("a labels value beats everything", () => {
    const cat = createFancyCatalog({ locale: "es", strings: { "demo.modal.close": "Cerrar (host)" }, packs: [ES] });
    const t = createTranslator(MESSAGES, cat, { "demo.modal.close": "Dismiss" });
    expect(t("demo.modal.close")).toBe("Dismiss");
  });

  it("an undefined labels value is not an override", () => {
    const cat = createFancyCatalog({ locale: "es", packs: [ES] });
    const t = createTranslator(MESSAGES, cat, { "demo.modal.close": undefined });
    expect(t("demo.modal.close")).toBe("Cerrar (pack)");
  });

  it("a function-valued label keeps working and receives the values", () => {
    const t = createTranslator(MESSAGES, null, {
      "demo.list.items": (v: Record<string, unknown>) => `${String(v.count)} new`,
    });
    expect(t.choice("demo.list.items", 3)).toBe("3 new");
  });

  it("an empty host string counts as missing (Bridge requirement 4)", () => {
    const cat = createFancyCatalog({ locale: "es", strings: { "demo.modal.close": "" }, packs: [ES] });
    expect(createTranslator(MESSAGES, cat)("demo.modal.close")).toBe("Cerrar (pack)");
  });

  it("an empty pack string counts as missing", () => {
    const cat = createFancyCatalog({ locale: "es", packs: [{ locale: "es", messages: { "demo.modal.close": "" } }] });
    expect(createTranslator(MESSAGES, cat)("demo.modal.close")).toBe("Close");
  });

  it("never returns a raw key, even for a locale with nothing", () => {
    const cat = createFancyCatalog({ locale: "rhg-Rohg" });
    const t = createTranslator(MESSAGES, cat);
    for (const key of Object.keys(MESSAGES) as (keyof typeof MESSAGES)[]) {
      const text = t(key);
      expect(text).not.toBe(key);
      expect(text).not.toBe("");
    }
  });

  it("an inherited Object property is never a translation", () => {
    const cat = createFancyCatalog({ locale: "es", strings: {} });
    const t = createTranslator(defineMessages({ constructor: "Builder", toString: "Text" }), cat);
    expect(t("constructor")).toBe("Builder");
    expect(t("toString")).toBe("Text");
  });

  it("an earlier pack wins over a later one", () => {
    const later: FancyI18nPack = { locale: "es", messages: { "demo.modal.close": "Later" } };
    const cat = createFancyCatalog({ locale: "es", packs: [ES, later] });
    expect(createTranslator(MESSAGES, cat)("demo.modal.close")).toBe("Cerrar (pack)");
  });

  it("only uses packs for the active locale: a language pack serves its regions, never the reverse", () => {
    const de: FancyI18nPack = { locale: "de", messages: { "demo.modal.close": "Schließen" } };
    const esMx: FancyI18nPack = { locale: "es-MX", messages: { "demo.modal.close": "Cerrar MX" } };
    expect(createTranslator(MESSAGES, createFancyCatalog({ locale: "es-MX", packs: [de, ES] }))("demo.modal.close")).toBe("Cerrar (pack)");
    expect(createTranslator(MESSAGES, createFancyCatalog({ locale: "es", packs: [esMx] }))("demo.modal.close")).toBe("Close");
  });

  it("serves the zh-Hans pack to zh and zh-CN, and never to zh-TW", () => {
    const zh: FancyI18nPack = { locale: "zh-Hans", messages: { "demo.modal.close": "关闭" } };
    expect(createTranslator(MESSAGES, createFancyCatalog({ locale: "zh", packs: [zh] }))("demo.modal.close")).toBe("关闭");
    expect(createTranslator(MESSAGES, createFancyCatalog({ locale: "zh-CN", packs: [zh] }))("demo.modal.close")).toBe("关闭");
    expect(createTranslator(MESSAGES, createFancyCatalog({ locale: "zh-TW", packs: [zh] }))("demo.modal.close")).toBe("Close");
  });
});

describe("resolve: where a label came from (the seam fancy-translations and the agent bridge read)", () => {
  it("reports each tier, and a pack key's origin", () => {
    const cat = createFancyCatalog({ locale: "es", strings: { "demo.list.summary": "Mostrando :from" }, packs: [ES] });
    const t = createTranslator(MESSAGES, cat, { "demo.rich.saved": "Guardado" });
    expect(t.resolve("demo.rich.saved")).toEqual({ text: "Guardado", from: "labels", locale: "es" });
    expect(t.resolve("demo.list.summary")).toEqual({ text: "Mostrando :from", from: "host", locale: "es" });
    expect(t.resolve("demo.modal.close")).toEqual({ text: "Cerrar (pack)", from: "pack", locale: "es", origin: "machine" });
    expect(t.resolve("demo.list.items")).toEqual({ text: ":count elemento|:count elementos", from: "pack", locale: "es" });
  });

  it("reports the English default as locale en", () => {
    const t = createTranslator(MESSAGES, createFancyCatalog({ locale: "de" }));
    expect(t.resolve("demo.modal.close")).toEqual({ text: "Close", from: "default", locale: "en" });
  });
});

describe("choice", () => {
  it("uses the provider locale's plural rule for a translated string", () => {
    const cat = createFancyCatalog({
      locale: "ru",
      strings: { "demo.list.items": ":count элемент|:count элемента|:count элементов" },
    });
    const t = createTranslator(MESSAGES, cat);
    expect(t.choice("demo.list.items", 1)).toBe("1 элемент");
    expect(t.choice("demo.list.items", 3)).toBe("3 элемента");
    expect(t.choice("demo.list.items", 5)).toBe("5 элементов");
  });

  it("uses ENGLISH plural rules when it falls back to the English default", () => {
    // A Russian rule applied to an English two-form string asks for segment 2,
    // which does not exist, and Laravel's fallback would print "5 item".
    const t = createTranslator(MESSAGES, createFancyCatalog({ locale: "ru" }));
    expect(t.choice("demo.list.items", 5)).toBe("5 items");
  });

  it("counts an array", () => {
    expect(createTranslator(MESSAGES, null).choice("demo.list.items", ["a", "b"])).toBe("2 items");
  });

  it("honours a host plural override", () => {
    const cat = createFancyCatalog({
      locale: "rhg-Rohg",
      strings: { "demo.list.items": "one :count|many :count" },
      pluralRules: { "rhg-Rohg": (n) => (n === 1 ? 0 : 1) },
    });
    expect(createTranslator(MESSAGES, cat).choice("demo.list.items", 4)).toBe("many 4");
  });

  it("warns in dev when a plural string has the wrong number of forms, and still returns segment 0", () => {
    const cat = createFancyCatalog({ locale: "ru", strings: { "demo.list.items": "a :count|b :count" } });
    expect(createTranslator(MESSAGES, cat).choice("demo.list.items", 5)).toBe("a 5");
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0]?.[0])).toContain("demo.list.items");
  });
});

describe("missing keys: warning and onMissingKey", () => {
  it("warns once per key and locale in dev when a non-English locale falls back to English", () => {
    const t = createTranslator(MESSAGES, createFancyCatalog({ locale: "de" }));
    t("demo.modal.close");
    t("demo.modal.close");
    t("demo.modal.close");
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0]?.[0])).toContain("demo.modal.close");
    expect(String(warn.mock.calls[0]?.[0])).toContain("de");
  });

  it("never warns for an English locale", () => {
    createTranslator(MESSAGES, createFancyCatalog({ locale: "en-GB" }))("demo.modal.close");
    expect(warn).not.toHaveBeenCalled();
  });

  it("never warns in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    const t = createTranslator(MESSAGES, createFancyCatalog({ locale: "de", strings: { "demo.list.items": "x|y" } }));
    t("demo.modal.close");
    t.choice("demo.list.items", 5);
    expect(warn).not.toHaveBeenCalled();
  });

  it("calls onMissingKey in production too, once per key", () => {
    vi.stubEnv("NODE_ENV", "production");
    const onMissingKey = vi.fn();
    const t = createTranslator(MESSAGES, createFancyCatalog({ locale: "de", onMissingKey }));
    t("demo.modal.close");
    t("demo.modal.close");
    expect(onMissingKey).toHaveBeenCalledTimes(1);
    expect(onMissingKey).toHaveBeenCalledWith("demo.modal.close", "de");
  });

  it("does not report a key the host or a pack supplied", () => {
    const onMissingKey = vi.fn();
    createTranslator(MESSAGES, createFancyCatalog({ locale: "es", packs: [ES], onMissingKey }))("demo.modal.close");
    expect(onMissingKey).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
  });
});

describe("nodes: tags and numbers as React nodes", () => {
  it("fills tags with the given function and placeholders inside them", () => {
    const t = createTranslator(MESSAGES, null);
    const html = renderToStaticMarkup(<>{t.nodes("demo.rich.saved", { name: "report.pdf" }, { b: (s) => <strong>{s}</strong> })}</>);
    expect(html).toBe("Saved <strong>report.pdf</strong> just now");
  });

  it("leaves a tag with no function as text, as Laravel does", () => {
    const html = renderToStaticMarkup(<>{createTranslator(MESSAGES, null).nodes("demo.rich.saved", { name: "x" })}</>);
    expect(html).toBe("Saved &lt;b&gt;x&lt;/b&gt; just now");
  });

  it("wraps numbers in an LTR bdi, and never markup from a value", () => {
    const t = createTranslator(MESSAGES, null);
    const html = renderToStaticMarkup(<>{t.nodes("demo.list.summary", { from: 1, to: 10, total: "<i>9</i>" })}</>);
    expect(html).toBe('Showing <bdi dir="ltr">1</bdi> to <bdi dir="ltr">10</bdi> of &lt;i&gt;9&lt;/i&gt;');
  });

  it("accepts a React node as a value", () => {
    const html = renderToStaticMarkup(<>{createTranslator(MESSAGES, null).nodes("demo.rich.saved", { name: <em>doc</em> })}</>);
    expect(html).toBe("Saved &lt;b&gt;<em>doc</em>&lt;/b&gt; just now");
  });

  it("returns the plain string when there is nothing to build", () => {
    expect(createTranslator(MESSAGES, null).nodes("demo.modal.close")).toBe("Close");
  });
});
