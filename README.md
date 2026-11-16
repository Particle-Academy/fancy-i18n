# @particle-academy/fancy-i18n

The runtime label layer for the Fancy Dev Kit. Every kit component keeps its
English defaults in a frozen object next to it. A host can put its own strings
and locale packs on top, in **Laravel's message format**, so the same
`lang/{locale}.json` works in `__()` on the server and in the kit on the client.

- Zero dependencies. React 19 is a peer.
- With no provider it costs nothing measurable. A component reads the context
  once and does a property lookup per string.
- It never fetches and never touches the DOM. It never decides text direction
  from a locale.
- Plural rules are Laravel's own (`getPluralIndex`), ported as data, so client
  and server always choose the same form.

> **Status: 0.1, phase 1 of the kit i18n plan.** No kit component reads it
> yet. react-fancy adopts it in the next phase, and the built-in es, de, ru and
> zh-Hans packs follow after that.

## Host

```tsx
import { FancyI18nProvider } from "@particle-academy/fancy-i18n";

<FancyI18nProvider
  locale={page.props.locale}        // an opaque BCP 47 tag: "es", "es-MX", "ksw-Mymr"
  strings={page.props.lang}         // flat { key: text }; the host always wins
  version={page.props.langHash}     // same hash: a new strings object re-renders nothing
  packs={[reactFancyEs]}            // optional bundled packs, below host strings
  pluralRules={{ "rhg-Rohg": (n) => (n === 1 ? 0 : 1) }}  // languages Laravel does not know
  formatLocale={{ ksw: "my" }}      // which locale Intl formats with
  onMissingKey={(key, locale) => report(key, locale)}     // runs in production too
>
  <App />
</FancyI18nProvider>
```

The lookup order is: the component's own label prop, then host `strings`, then
each pack in order, then English. It never shows a raw key, and an empty string
in a lang file counts as missing. If a non-English locale falls back to
English, development builds warn once per key.

**Keep the props stable.** If a provider's value changes identity, every
memoised consumer under it re-renders. Inline `packs`, `pluralRules` and
`formatLocale` objects, and a new `onMissingKey` function, are compared by
content, so they are safe. A new `strings` object is safe only when you pass
`version`.

## Component

```tsx
import { defineMessages, useFancyT, useFancyFormat } from "@particle-academy/fancy-i18n";

const MESSAGES = defineMessages({
  "react-fancy.pagination.page": "Page :page of :pages",
  "react-fancy.upload.files": "{0} No files|{1} One file|[2,*] :count files",
  "react-fancy.upload.saved": "Saved <b>:name</b>",
});

function Footer({ page, pages, labels }) {
  const t = useFancyT(MESSAGES, labels);     // one context read; labels win
  const f = useFancyFormat();                // cached Intl formatters
  return (
    <>
      {t("react-fancy.pagination.page", { page, pages })}
      {t.choice("react-fancy.upload.files", files.length)}
      {t.nodes("react-fancy.upload.saved", { name }, { b: (s) => <strong>{s}</strong> })}
      {f.bytes(file.size)} {f.months()[0]}
    </>
  );
}
```

Keys are `<package>.<component>.<name>`. A `t()` call only accepts the keys of
its component's object.

## The format: Laravel's

| | Example | Notes |
|---|---|---|
| Placeholders | `:name`, `:Name`, `:NAME` | One pass, longest match wins (`:counts` with `{count: 5}` is `5s`) |
| Plurals | `apple\|apples` | The locale's form, or the first form when a form is missing |
| Conditions | `{0} none\|[1,5] few\|[6,*] many` | A condition wins over the plural index |
| Tags | `<b>:name</b>` | Filled by `t.nodes()`; plain `t()` leaves them as text. HTML is never parsed |

The shared fixture `@particle-academy/fancy-i18n/fixtures/laravel-format.json`
pins this behaviour. Every expected value in it was checked against Laravel's
own `Translator` and `MessageSelector`.

**Plurals come from Laravel's table, not `Intl.PluralRules`.** `Intl` silently
treats languages it has no data for as English. Its category counts also
disagree with Laravel's for es, ru and pl. The kit normalises `es-MX` to `es` and
`zh-Hans` to `zh`, which stock Laravel does not. A language that neither Laravel
nor the host knows gets one form. That is a fallback, not a rule for the
language.

## Packs and where a string came from

```ts
const pack: FancyI18nPack = {
  locale: "es",                                   // serves es, es-MX, ...
  messages: { "react-fancy.modal.close": "Cerrar" },
  meta: { "react-fancy.modal.close": { origin: "machine", sourceHash: "..." } },
};

t.resolve("react-fancy.modal.close");
// { text: "Cerrar", from: "pack", locale: "es", origin: "machine" }
```

`origin` is `machine`, `community` (accepted through fancy-translations) or
`maintainer`. fancy-translations reads the same shape.

## Limits

```ts
configureFancyI18n({ templateCacheSize: 2000, formatterCacheSize: 64, warningMemory: 1000 });
```

## Performance

The CI tests measure these numbers. They are not estimates.

| | Measured | Budget |
|---|---|---|
| 2,000 components x 3 strings, SSR, no provider | 1.02 to 1.04x a literal | 1.10x |
| The same with an es provider | 1.05 to 1.06x | 1.25x |
| Consumer re-renders, 20 parent renders, stable provider | 0 | 0 |
| A component's size (gzip, minified, production) | 3,160 B | 3,300 B |
| 100,000 characters of hostile translated text | linear: 1 to 30 ms | 250 ms |

## License

MIT
