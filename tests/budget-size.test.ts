// @vitest-environment node
import { describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { gzipSync } from "node:zlib";
import { build } from "tsup";

/**
 * Performance budget, part 4: size. Measured the way an app ships it:
 * minified, tree-shaken, process.env.NODE_ENV set to "production" so dev
 * warnings are stripped, React left external because it is the host's.
 *
 * Three bundles, because consumers pay for different things:
 * - COMPONENT: what every labelled component and the host pay
 *   (FancyI18nProvider + useFancyT + defineMessages);
 * - FORMAT: what a component that formats adds on its own (useFancyFormat);
 * - ENTRY: the whole package, every export.
 *
 * THE CORE BUDGET (owner, 2026-11-13, q_5562c08b): about 3.2 KB gzip,
 * replacing the plan's original I12 figure of 1,536 B, which was an estimate
 * the phase-1 scope could not meet. 0.1 measures 3,160 B for a component; the
 * gate is 3,300 B, a 140 B (4.4%) margin, so the budget guards growth rather
 * than recording it. Moving it is an owner decision, never a test edit.
 */
const BUDGET = {
  /** The owner's core budget (q_5562c08b). */
  component: 3300,
  /** 0.1 measures 777 B. */
  format: 896,
  /** 0.1 measures 3,971 B. */
  entry: 4096,
};

async function gzipOf(exports: string): Promise<{ raw: number; gz: number; code: string }> {
  const dir = mkdtempSync(join(tmpdir(), "fancy-i18n-size-"));
  try {
    const entry = join(dir, "entry.ts");
    writeFileSync(entry, `export { ${exports} } from ${JSON.stringify(resolve("src/index.ts").replace(/\\/g, "/"))};\n`);
    await build({
      config: false,
      entry: { index: entry },
      format: ["esm"],
      outDir: join(dir, "out"),
      minify: true,
      treeshake: true,
      dts: false,
      sourcemap: false,
      silent: true,
      external: ["react", "react/jsx-runtime"],
      define: { "process.env.NODE_ENV": '"production"' },
    });
    const file = readdirSync(join(dir, "out")).find((f) => f.endsWith(".js"))!;
    const code = readFileSync(join(dir, "out", file));
    return { raw: code.length, gz: gzipSync(code, { level: 9 }).length, code: code.toString() };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const ALL = Object.keys(await import("../src/index")).join(", ");

describe("size budget", () => {
  it(`the core a component pays is at most ${BUDGET.component} B gzip (owner, q_5562c08b); format and the whole entry stay under theirs; production strips every dev warning`, async () => {
    const component = await gzipOf("FancyI18nProvider, useFancyT, defineMessages");
    const format = await gzipOf("useFancyFormat");
    const entry = await gzipOf(ALL);
    process.stderr.write(
      `[fancy-i18n budget] gzip, minified, production: component ${component.gz} B of ${BUDGET.component} (raw ${component.raw}), ` +
        `format ${format.gz} B of ${BUDGET.format}, whole entry ${entry.gz} B of ${BUDGET.entry} (raw ${entry.raw})\n`,
    );
    for (const b of [component, format, entry]) expect(b.code).not.toContain("[fancy-i18n]");
    // A component that never formats does not ship the formatter.
    expect(component.code).not.toContain("RelativeTimeFormat");
    expect(component.gz).toBeLessThanOrEqual(BUDGET.component);
    expect(format.gz).toBeLessThanOrEqual(BUDGET.format);
    expect(entry.gz).toBeLessThanOrEqual(BUDGET.entry);
  });
});
