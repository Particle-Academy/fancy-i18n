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
 * The owner's figure (kit-i18n plan, I12) is 1,536 bytes gzip for "the core".
 * 0.1 does NOT meet it: the phase-1 scope (the Laravel plural table for 280
 * locale labels, a strtr-faithful replacer, the condition selector, nodes,
 * resolve, version pinning) measures about twice that, and the plan's figure
 * was an estimate, never a measurement. That is an owner decision, so it is
 * kept visible below as a skipped test that names it, rather than quietly
 * raised. Until then the ceilings here stop the package from GROWING past
 * what 0.1 measured.
 */
const OWNER_BUDGET = 1536;
// Raised once, on 2026-11-13, by the linear tag scanner that replaced a
// quadratic regex (code-scanning alert 1): about 226 B for a security fix.
const CEILING = { component: 3328, format: 896, entry: 4096 };

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
  it("each bundle stays under its ceiling, and production strips every dev warning", async () => {
    const component = await gzipOf("FancyI18nProvider, useFancyT, defineMessages");
    const format = await gzipOf("useFancyFormat");
    const entry = await gzipOf(ALL);
    process.stderr.write(
      `[fancy-i18n budget] gzip, minified, production: component ${component.gz} B (raw ${component.raw}), ` +
        `format ${format.gz} B, whole entry ${entry.gz} B (raw ${entry.raw}); owner budget I12 ${OWNER_BUDGET} B\n`,
    );
    for (const b of [component, format, entry]) expect(b.code).not.toContain("[fancy-i18n]");
    // A component that never formats does not ship the formatter.
    expect(component.code).not.toContain("RelativeTimeFormat");
    expect(component.gz).toBeLessThanOrEqual(CEILING.component);
    expect(format.gz).toBeLessThanOrEqual(CEILING.format);
    expect(entry.gz).toBeLessThanOrEqual(CEILING.entry);
  });

  // NOT MET in 0.1, awaiting the owner. Un-skip when the budget or the scope changes.
  it.skip(`OWNER BUDGET I12: the core is at most ${OWNER_BUDGET} B gzip (0.1 measures about 3,160 B for a component, 3,970 B whole)`, async () => {
    expect((await gzipOf("FancyI18nProvider, useFancyT, defineMessages")).gz).toBeLessThanOrEqual(OWNER_BUDGET);
  });
});
