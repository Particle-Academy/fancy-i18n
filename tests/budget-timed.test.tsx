// @vitest-environment node
import { describe, expect, it } from "vitest";
import { createElement, type ReactElement } from "react";
import { renderToString } from "react-dom/server";
import { FancyI18nProvider, defineMessages, makeReplacements, useFancyT } from "../src";

/**
 * Performance budget, part 3 (plan section 11, owner decision I12): the timed
 * check. 2,000 components x 3 strings, one interpolated, rendered with
 * renderToString; variants interleaved round-robin so JIT warm-up and GC land
 * on all of them alike; 3 trials of 15 rounds; the median of trial medians.
 *
 * Budget: no provider at most 1.10x the control, an es provider at most 1.25x.
 * The control is a literal plus the same Laravel-faithful interpolation, so the
 * ratio measures the label layer, not interpolation.
 *
 * Timed tests are the only kind that can flake, which is why the hard
 * guarantees (0 re-renders, compile-once, construct-once) are deterministic
 * tests elsewhere and this bound sits well above the measured cost.
 */
const N = 2000;
const ROUNDS = 15;
const TRIALS = 3;

const MESSAGES = defineMessages({
  "demo.a": "Close",
  "demo.b": "Open the menu",
  "demo.c": "Page :page of :pages",
});

const ES = { "demo.a": "Cerrar", "demo.b": "Abrir el menú", "demo.c": "Página :page de :pages" };

function Control({ i }: { i: number }) {
  return createElement(
    "li",
    null,
    createElement("span", null, "Close"),
    createElement("span", null, "Open the menu"),
    createElement("span", null, makeReplacements("Page :page of :pages", { page: i, pages: N })),
  );
}

function Labelled({ i }: { i: number }) {
  const t = useFancyT(MESSAGES);
  return createElement(
    "li",
    null,
    createElement("span", null, t("demo.a")),
    createElement("span", null, t("demo.b")),
    createElement("span", null, t("demo.c", { page: i, pages: N })),
  );
}

function tree(Item: (p: { i: number }) => ReactElement) {
  return createElement("ul", null, Array.from({ length: N }, (_, i) => createElement(Item, { key: i, i })));
}

const variants: Record<string, () => ReactElement> = {
  control: () => tree(Control),
  noProvider: () => tree(Labelled),
  esProvider: () => createElement(FancyI18nProvider, { locale: "es", strings: ES }, tree(Labelled)),
};

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)] ?? NaN;
};

/**
 * Returns, per variant, the median of trial medians of its time AND of its
 * ratio to the control timed in the same round. Pairing each ratio with the
 * control from its own round cancels drift (GC, clock speed) between rounds,
 * which a ratio of two separate medians does not.
 */
function measure() {
  const names = Object.keys(variants);
  // Warm-up: every variant, untimed.
  for (let w = 0; w < 3; w++) for (const n of names) renderToString(variants[n]!());
  const ms: Record<string, number[]> = Object.fromEntries(names.map((n) => [n, []]));
  const ratio: Record<string, number[]> = Object.fromEntries(names.map((n) => [n, []]));
  for (let trial = 0; trial < TRIALS; trial++) {
    const rounds: Record<string, number[]> = Object.fromEntries(names.map((n) => [n, []]));
    const ratios: Record<string, number[]> = Object.fromEntries(names.map((n) => [n, []]));
    for (let r = 0; r < ROUNDS; r++) {
      const round: Record<string, number> = {};
      // Rotate the order each round so no variant always runs first.
      for (let k = 0; k < names.length; k++) {
        const n = names[(r + k) % names.length]!;
        const el = variants[n]!();
        const t0 = performance.now();
        renderToString(el);
        round[n] = performance.now() - t0;
      }
      for (const n of names) {
        rounds[n]!.push(round[n]!);
        ratios[n]!.push(round[n]! / round.control!);
      }
    }
    for (const n of names) {
      ms[n]!.push(median(rounds[n]!));
      ratio[n]!.push(median(ratios[n]!));
    }
  }
  const pick = (src: Record<string, number[]>) => Object.fromEntries(names.map((n) => [n, median(src[n]!)])) as Record<string, number>;
  return { ms: pick(ms), ratio: pick(ratio) };
}

describe("timed render budget (SSR)", () => {
  it("each variant renders the strings it should", () => {
    expect(renderToString(variants.noProvider!())).toContain("Page 7 of 2000");
    expect(renderToString(variants.esProvider!())).toContain("Página 7 de 2000");
  });

  it("no provider <= 1.10x control; es provider <= 1.25x control", () => {
    const { ms, ratio } = measure();
    // Written to stderr so the numbers are on the record of every run, not
    // only a failing one (vitest shows console output for failures only).
    process.stderr.write(
      `[fancy-i18n budget] ${N} components x 3 strings, median of ${TRIALS}x${ROUNDS}: ` +
        `control ${ms.control!.toFixed(2)} ms, no provider ${ms.noProvider!.toFixed(2)} ms (${ratio.noProvider!.toFixed(3)}x), ` +
        `es provider ${ms.esProvider!.toFixed(2)} ms (${ratio.esProvider!.toFixed(3)}x)\n`,
    );
    expect(ratio.noProvider).toBeLessThanOrEqual(1.1);
    expect(ratio.esProvider).toBeLessThanOrEqual(1.25);
  });
});
