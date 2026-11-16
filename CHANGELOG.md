# Changelog

All notable changes to this project are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

**Pre-1.0, breaking changes land in MINOR releases.** The version number is not
promising otherwise until 1.0.

## [Unreleased]

### Changed

- Rebranded the display name to Fancy Dev Kit (README and package description). Package names, the npm scope, URLs and the `fancy-ui` MCP id are unchanged.

## [0.1.0] - 2026-11-15

First release: phase 1 of the kit i18n plan (owner-approved 2026-11-07). No
kit component reads it yet; react-fancy adopts it in phase 2.

### Added

- **`FancyI18nProvider`** takes `locale`, host `strings` (for example an Inertia
  `lang` prop), optional `version`, `packs`, `pluralRules`, `formatLocale` and
  `onMissingKey`. It renders no DOM, never sets `dir`, and never fetches. Its
  value is pinned: a parent re-render, an inline `packs` array, an inline
  options object, a new callback, or a new `strings` object with the same
  `version` re-renders no consumer.
- **`useFancyT(defaults, labels?)`**: one context read per component. It
  returns `t(key, values)`, `t.choice(key, count, values)`,
  `t.nodes(key, values, tags)` (React nodes, numbers in `<bdi dir="ltr">`) and
  `t.resolve(key)` (the text and its tier: `labels`, `host`, `pack` or
  `default`, plus a pack key's `origin`). The lookup order is labels, then host
  strings, then packs, then English. It never returns a raw key, and an empty
  string from a lang file counts as missing.
- **Laravel's message format, ported faithfully:** `:name` / `:Name` / `:NAME`
  in one longest-match pass (`makeReplacements`); pipe plurals with `{n}`,
  `[a,b]` and `[a,*]` conditions (`choose`); `getPluralIndex` as data for all
  280 locale labels in Laravel 13.34.0 (`pluralIndex`, `pluralForms`). Two
  additions Laravel lacks: `es-MX`, `zh-Hans` and `ksw-Mymr` normalise to their
  language, and host plural overrides.
- **`fixtures/laravel-format.json`**: the shared fixture, also exported, so
  fancy-translations' Pest suite runs the same cases. Every expected value was
  checked against Laravel's own classes.
- **`useFancyFormat()` / `formatFor(catalog)`**: cached `Intl` formatters for
  number, compact, bytes, date, time, relative time, list, display names, and
  month and weekday names. A component that never formats does not ship it.
- **`BUILTIN_LOCALES`** (en, es, de, ru, zh-Hans) and
  **`resolveBuiltinLocale()`**: zh, zh-CN and zh-SG read Simplified Chinese.
  Traditional Chinese is never served Simplified.
- **`FancyI18nPack`** with per-key `meta` (`origin`: `machine`, `community` or
  `maintainer`, and a `sourceHash`). This is the seam for fancy-translations.
- **`configureFancyI18n()`**: the template cache, the formatter cache and the
  warning memory are all settings.
- Dev-only warnings, once per key and locale, for a missing translation, a
  plural with the wrong number of forms, or a key a component forgot. A
  production build strips them. `onMissingKey` runs in production too.

### Performance

- With 2,000 components x 3 strings rendered with `renderToString`, compared
  with a literal plus the same interpolation: about 1.02 to 1.04x with no
  provider, and 1.05 to 1.06x with an es provider. The budget is 1.10x and
  1.25x.
- With a stable provider, 0 consumer re-renders across 20 parent renders. A
  locale change re-renders each consumer exactly once.
- Size (gzip, minified, production): 3,160 B for what a labelled component
  pays, 777 B more for formatting, and 3,971 B for the whole entry.
- **Core size budget: 3,300 B gzip**, enforced by a gating test. The owner
  accepted about 3.2 KB on 2026-11-13 (decision `q_5562c08b`), replacing the
  plan's original I12 figure of 1,536 B. That figure was an estimate, and the
  phase-1 scope could not meet it. The test also gates formatting at 896 B and
  the whole entry at 4,096 B.

### Security

- **Everything that parses translated text runs in linear time.** Lang files,
  packs and community corrections are untrusted input. Before this was tagged,
  code scanning flagged PHP's trim, which was written as `/^[ws]+|[ws]+$/`
  (`js/polynomial-redos`, alert 1). It took 8 s on a 100,000-character
  whitespace run inside a plural condition. It is now a scan from each end,
  and the same input takes 3 ms. A review of every other regex found two more
  problems in `t.nodes`' tag matching:
  - A lazy, unanchored `<b>(.*?)</b>` took 0.9 s on unclosed tags.
  - The parser recursed once per matched tag, so 12,500 tag pairs overflowed
    the stack.

  Both are now one forward scan. `tests/hostile-input.test.tsx` holds a timed
  case for each, and every case failed on the old code. No released version
  was affected.
