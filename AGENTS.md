# Using @particle-academy/fancy-i18n — guide for agents

How an agent installs and uses this package in a consumer app. What the package
is, is in [README.md](./README.md). Notes for working ON this repo's code are in
[CONTRIBUTING.md](./CONTRIBUTING.md).

## Install

```bash
npm install @particle-academy/fancy-i18n
```

- Zero runtime dependencies. **Peer:** `react ^19`.
- **Status 0.1:** no kit component reads it yet. react-fancy adopts it in a
  later phase, and the built-in es, de, ru and zh-Hans packs follow after that.

## Find it on the Fancy MCP server

Not listed on the Fancy MCP catalog server
(`https://ui.particle.academy/mcp`, MCP id `fancy-ui`) yet; it appears there
once it is. Look for it later with `search-components`.

## API essentials

- **Host:** wrap the app in `FancyI18nProvider` with `locale` (an opaque BCP 47
  tag), `strings` (flat `{ key: text }`, Laravel `lang/{locale}.json` format),
  and optionally `version`, `packs`, `pluralRules`, `formatLocale`,
  `onMissingKey`. The README's Host section shows each.
- **Component:** `defineMessages({...})` holds the English defaults, keyed
  `<package>.<component>.<name>`. `useFancyT(MESSAGES, labels)` returns `t`:
  `t(key, values)`, `t.choice(key, count, values)`, `t.nodes(key, values,
  tags)` (fills `<b>`-style tags with your renderers) and `t.resolve(key)`
  (the text plus where it came from). `useFancyFormat()` gives cached Intl
  formatters.
- **Lookup order:** the component's label prop, then host `strings`, then each
  pack, then English.
- **Format:** Laravel's. Placeholders `:name` / `:Name` / `:NAME`, plurals
  `a|b`, conditions `{0} none|[1,5] few|[6,*] many`. The shared fixture is
  `@particle-academy/fancy-i18n/fixtures/laravel-format.json`.
- **Packs:** `FancyI18nPack` = `{ locale, messages, meta? }`, where `meta`
  records each string's `origin` (`machine`, `community`, `maintainer`).
- **Limits:** `configureFancyI18n({ templateCacheSize, formatterCacheSize,
  warningMemory })`.

## Traps

- **A new `strings` object re-renders every consumer** unless you pass
  `version` (for example a hash of the lang file). Inline `packs`,
  `pluralRules`, `formatLocale` and a new `onMissingKey` are compared by
  content and are safe.
- **An empty string in a lang file counts as missing**, and a raw key is never
  shown.
- **Plurals follow Laravel's table, not `Intl.PluralRules`.** A language neither
  Laravel nor the host knows gets one form; give it a rule with `pluralRules`.
- `t()` leaves tags as text; only `t.nodes()` fills them. HTML is never parsed.
- A `t()` call only accepts the keys of its component's message object.
- It never fetches, never touches the DOM and never decides text direction
  from a locale.
- `onMissingKey` runs in production too.
