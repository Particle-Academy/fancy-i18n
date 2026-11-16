# AGENTS.md: fancy-i18n

The runtime label layer for the Fancy Dev Kit. `CLAUDE.md` is a symlink to this
file. Process rules (publishing, versions, third-party code) live in the
envelope's `RULES.md` and are not repeated here. The design is the envelope's
`.ai/plans/kit-i18n.md`.

## Where things are

- `src/message.ts`: `makeReplacements` (Laravel's strtr pass), `choose` /
  `chooseWith` (MessageSelector with conditions). Compiled splits are cached in
  `internal.ts`'s `templates`.
- `src/plural.ts`: Laravel's `getPluralIndex` as data, by language, with
  normalisation and host overrides.
- `src/locales.ts`: `canon`, `language`, the five built-in locales, the
  Simplified Chinese aliases, `packServes`.
- `src/catalog.ts`: `createFancyCatalog`, the context value. Its shape is a
  protocol between installed copies, so it only grows (`protocol: 1`).
- `src/translator.ts`: `createTranslator`, which builds `t`, `choice`, `nodes`
  and `resolve`.
- `src/react.tsx`: `FancyI18nProvider` (identity pinning) and `useFancyT`
  (shared translators).
- `src/context.ts`: the context, created on a global symbol.
- `src/format.ts`: cached Intl formatters. It is kept apart so a component that
  doesn't format doesn't ship it.
- `fixtures/laravel-format.json`: the shared fixture. fancy-translations runs
  it in Pest. It ships in the tarball.

## Invariants (each has a test that was shown to fail without its mechanism)

- **The Laravel format is Laravel's.** Change a fixture value only after
  checking it against Laravel's own `Translator::makeReplacements` and
  `MessageSelector`. Never change one to match this code. A plural rule change
  must still agree with Laravel for all 280 of its locale labels.
- **English text takes English plural rules.** When `t.choice` falls back to
  the English default, it selects with `en`, never the page locale.
- **The order is labels, host, packs, English.** An empty string counts as
  missing. It never returns a raw key, and an inherited Object property is
  never a translation.
- **Identity.** The provider value changes only when locale, pinned strings,
  packs (compared by content), plural rules, or `formatLocale` change. A new
  `onMissingKey` never rebuilds it. `useFancyT` has exactly one hook,
  `useContext`. Adding a hook or a memo there is a measured cost.
- **No building on the plain path.** `t(key)` with no values allocates nothing
  and compiles nothing. A template is split once. An Intl formatter is built
  once for each pair of locale and options.
- **Dev warnings are guarded inline** by
  `typeof process != "undefined" && process.env.NODE_ENV !== "production"`, so
  a production bundle drops them, message and all. Don't move that guard into
  a helper: esbuild doesn't inline a function, and the size test checks that
  `[fancy-i18n]` is gone from the build.
- **Translated text is untrusted, and everything that parses it is linear.**
  That covers PHP's trim and the tag scan in `t.nodes`. Neither is a regex,
  because the regexes they replaced were quadratic (code-scanning alert 1).
  The only regexes left on that text are anchored, with one way to match.
  A new regex on message text needs a timed case in
  `tests/hostile-input.test.tsx`, and the case must fail on a backtracking
  version.
- **No DOM, no fetch, no `dir`.** The only `dir` is the `ltr` isolate around
  numbers in `t.nodes`.
- **Zero runtime dependencies.**

## Tests

`npm test`. The budget tests print their numbers to stderr:
`budget-deterministic` (compile, construct and cache counts),
`provider.test.tsx` (re-render counts), `budget-timed` (the SSR ratio, paired
per round), and `budget-size` (three bundles). The core budget is 3,300 B gzip for a
component (owner, 2026-11-13, `q_5562c08b`). Only the owner moves it; a test
edit never does. Read results from a redirected log and its exit code, never
through a pipe.
