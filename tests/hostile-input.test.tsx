import { describe, expect, it } from "vitest";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { choose, createFancyCatalog, createTranslator, defineMessages, makeReplacements } from "../src";

/**
 * Translated text is untrusted input: a lang file, a pack, a community
 * correction. Nothing that parses it may be super-linear. Each case is 100,000
 * characters or more built to defeat a backtracking regex; the bound is wide
 * (a linear pass takes a few milliseconds) and the old regexes took seconds.
 */
const N = 100_000;
const BOUND_MS = 250;

function timed<T>(fn: () => T): { ms: number; value: T } {
  const t0 = performance.now();
  const value = fn();
  return { ms: performance.now() - t0, value };
}

const MESSAGES = defineMessages({ "demo.k": "x" });
const translator = (text: string) => createTranslator(MESSAGES, createFancyCatalog({ locale: "es", strings: { "demo.k": text } }));

describe("hostile translated text runs in linear time", () => {
  it("a long whitespace run inside a matched plural condition (code-scanning alert 1)", () => {
    for (const ch of [" ", "\t", "\u0000", "\u000B", "\n"]) {
      const line = "{0}a" + ch.repeat(N) + "b|x";
      const { ms, value } = timed(() => choose(line, 0, "en"));
      expect(value).toBe("a" + ch.repeat(N) + "b");
      expect(ms, JSON.stringify(ch)).toBeLessThan(BOUND_MS);
    }
  });

  it("trims a condition segment exactly as PHP's trim does", () => {
    expect(choose("{0} \t\n\r\u0000\u000B none \u000B|x", 0, "en")).toBe("none");
    // PHP's trim does not strip a no-break space or a form feed.
    expect(choose("{0} none\f|x", 0, "en")).toBe(" none\f");
  });

  it("many opening tags with no closing tag", () => {
    const t = translator("<b>".repeat(N / 3));
    const { ms, value } = timed(() => renderToStaticMarkup(<>{t.nodes("demo.k", undefined, { b: (s) => <strong>{s}</strong> })}</>));
    expect(value).toBe("&lt;b&gt;".repeat(N / 3));
    expect(ms).toBeLessThan(BOUND_MS * 2);
  });

  it("opening tags on many lines with one closing tag at the very end (the lazy match never crosses a newline)", () => {
    const t = translator("<b>\n".repeat(N / 4) + "</b>");
    const { ms } = timed(() => t.nodes("demo.k", undefined, { b: (s) => <strong>{s}</strong> }));
    expect(ms).toBeLessThan(BOUND_MS * 2);
  });

  it("many matched tags in a row neither recurse per tag nor slow down", () => {
    const pairs = N / 8;
    const t = translator("<b>x</b>".repeat(pairs));
    const { ms, value } = timed(() => renderToStaticMarkup(<>{t.nodes("demo.k", undefined, { b: (s) => <i>{s}</i> })}</>));
    expect(value).toBe("<i>x</i>".repeat(pairs));
    expect(ms).toBeLessThan(BOUND_MS * 4);
  });

  it("a tag name that is never present costs nothing per occurrence of another", () => {
    const t = translator("<b>".repeat(N / 3));
    const { ms } = timed(() => t.nodes("demo.k", undefined, { a: (s) => s, b: (s) => s, c: (s) => s }));
    expect(ms).toBeLessThan(BOUND_MS * 2);
  });

  it("a long numeric-looking condition", () => {
    const line = "[" + "1".repeat(N) + ".,*] big|small";
    const { ms } = timed(() => choose(line, 5, "en"));
    expect(ms).toBeLessThan(BOUND_MS);
  });

  it("many colons with values", () => {
    const { ms } = timed(() => makeReplacements(":a:".repeat(N / 3), { a: 1, b: 2 }));
    expect(ms).toBeLessThan(BOUND_MS * 2);
  });
});

describe("tag parsing keeps Laravel's semantics", () => {
  const t = (text: string, tags: Record<string, (s: ReactNode) => ReactNode>, values?: Record<string, unknown>) =>
    renderToStaticMarkup(<>{translator(text).nodes("demo.k", values, tags)}</>);
  const b = (s: ReactNode) => <strong>{s}</strong>;
  const i = (s: ReactNode) => <em>{s}</em>;

  it("the nearest closing tag ends a match (lazy)", () => {
    expect(t("<b>1</b>2</b>", { b })).toBe("<strong>1</strong>2&lt;/b&gt;");
  });

  it("an unclosed tag before a closed one stays text", () => {
    expect(t("<b>a<i>c</i>", { b, i })).toBe("&lt;b&gt;a<em>c</em>");
  });

  it("a match never crosses a newline", () => {
    expect(t("<b>a\nc</b> <b>d</b>", { b })).toBe("&lt;b&gt;a\nc&lt;/b&gt; <strong>d</strong>");
  });

  it("other tags nest inside a match", () => {
    expect(t("<b>x <i>:n</i></b>!", { b, i }, { n: 3 })).toBe('<strong>x <em><bdi dir="ltr">3</bdi></em></strong>!');
  });

  it("text around and between matches is kept", () => {
    expect(t("a<b>1</b>b<i>2</i>c", { b, i })).toBe("a<strong>1</strong>b<em>2</em>c");
  });
});
