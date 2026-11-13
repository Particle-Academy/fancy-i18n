// @vitest-environment node
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const pkg = JSON.parse(readFileSync("package.json", "utf8"));
const src = readdirSync("src")
  .filter((f) => /\.tsx?$/.test(f))
  .map((f) => ({ f, text: readFileSync(join("src", f), "utf8") }));

describe("packaging", () => {
  it("has zero runtime dependencies and React as its only peer", () => {
    expect(pkg.dependencies ?? {}).toEqual({});
    expect(Object.keys(pkg.peerDependencies)).toEqual(["react"]);
  });

  it("ships the shared fixture, so fancy-translations can read the same file", () => {
    expect(pkg.files).toContain("fixtures");
    expect(pkg.exports["./fixtures/laravel-format.json"]).toBe("./fixtures/laravel-format.json");
  });

  it("never fetches and never touches the DOM", () => {
    for (const { f, text } of src) {
      expect(text, f).not.toMatch(/\bfetch\s*\(/);
      expect(text, f).not.toMatch(/XMLHttpRequest|\bdocument\.|\bwindow\.|\blocalStorage\b|import\s*\(/);
    }
  });

  it("never sets dir from a locale: the only dir is the LTR isolate around numbers", () => {
    for (const { f, text } of src) {
      const dirs = text.match(/\bdir\s*[:=]\s*"[a-z]+"/g) ?? [];
      for (const d of dirs) expect(d, f).toMatch(/"ltr"/);
    }
  });

  it("creates its React context once, under a global symbol", () => {
    const all = src.map((s) => s.text).join("\n");
    expect(all).toContain('Symbol.for("particle-academy.fancy-i18n.context")');
  });
});
