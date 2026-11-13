import { describe, expect, it } from "vitest";
import { createFancyCatalog, FancyI18nProvider, formatFor, useFancyFormat, type FancyFormat } from "../src";
import { mount } from "./helpers";

const d = new Date(Date.UTC(2026, 0, 5, 12, 30));

describe("useFancyFormat", () => {
  it("formats with the provider's locale", () => {
    let f: FancyFormat | undefined;
    function Probe() {
      f = useFancyFormat();
      return null;
    }
    const m = mount(
      <FancyI18nProvider locale="de">
        <Probe />
      </FancyI18nProvider>,
    );
    expect(f?.locale).toBe("de");
    expect(f?.number(1234.5)).toBe("1.234,5");
    m.unmount();
  });

  it("formatLocale maps a locale Intl has no data for (ksw) to one it has (my)", () => {
    const f = formatFor(createFancyCatalog({ locale: "ksw", formatLocale: { ksw: "my" } }));
    expect(f.locale).toBe("my");
    expect(f.months()).toEqual(formatFor(createFancyCatalog({ locale: "my" })).months());
  });

  it("formatLocale matches on the language when the exact tag is not mapped, and the exact tag first", () => {
    expect(formatFor(createFancyCatalog({ locale: "ksw-Mymr", formatLocale: { ksw: "my" } })).locale).toBe("my");
    expect(formatFor(createFancyCatalog({ locale: "ksw-Mymr", formatLocale: { ksw: "my", "ksw-Mymr": "en" } })).locale).toBe("en");
    expect(formatFor(createFancyCatalog({ locale: "ksw-Mymr", formatLocale: { "ksw-Mymr": "en", ksw: "my" } })).locale).toBe("en");
  });

  it("without a provider, uses the runtime default locale, as toLocaleString(undefined) does", () => {
    let f: FancyFormat | undefined;
    function Probe() {
      f = useFancyFormat();
      return null;
    }
    const m = mount(<Probe />);
    expect(f?.locale).toBeUndefined();
    expect(f?.number(1234.5)).toBe((1234.5).toLocaleString());
    m.unmount();
  });
});

describe("formatters", () => {
  const es = formatFor(createFancyCatalog({ locale: "es" }));
  const en = formatFor(createFancyCatalog({ locale: "en" }));

  it("month and weekday names come from Intl, not a hard-coded English list", () => {
    expect(en.months()[0]).toBe("January");
    expect(es.months()[0]).toBe("enero");
    expect(en.months("short")).toHaveLength(12);
    expect(en.weekdays()[0]).toBe("Sunday");
    expect(es.weekdays()[1]).toBe("lunes");
  });

  it("compact numbers", () => {
    expect(en.compact(1500)).toBe("1.5K");
    expect(es.compact(1500000)).toBe(new Intl.NumberFormat("es", { notation: "compact" }).format(1500000));
  });

  it("bytes, base 1024 by default (as react-fancy's FileUpload counts them), with localised units", () => {
    expect(en.bytes(512)).toBe("512 byte");
    expect(en.bytes(1536)).toBe("1.5 kB");
    expect(en.bytes(5 * 1024 * 1024)).toBe("5 MB");
    expect(en.bytes(1500, { base: 1000 })).toBe("1.5 kB");
    expect(es.bytes(1536)).toBe(new Intl.NumberFormat("es", { style: "unit", unit: "kilobyte", maximumFractionDigits: 1 }).format(1.5));
  });

  it("dates, times, relative times, lists and display names", () => {
    expect(en.date(d, { timeZone: "UTC" })).toBe(new Intl.DateTimeFormat("en", { timeZone: "UTC" }).format(d));
    expect(en.time(d, { timeZone: "UTC" })).toBe("12:30 PM");
    expect(es.relative(-1, "day")).toBe(new Intl.RelativeTimeFormat("es").format(-1, "day"));
    expect(en.list(["a", "b", "c"])).toBe("a, b, and c");
    expect(en.displayName("de", { type: "language" })).toBe("German");
    expect(es.displayName("DE", { type: "region" })).toBe("Alemania");
  });
});
