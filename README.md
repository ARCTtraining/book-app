# Reading Log

A mobile-first PWA prototype for a personal reading tracker. Book search runs
against the live Google Books API; localStorage still stands in for a database.
No auth, no server-side persistence yet.

```bash
npm install
cp .env.example .env.local   # then add your Google Books key
npm run dev          # http://localhost:3000
npm run build && npm start   # service worker only registers in production
```

## Tests

```bash
npm test             # 129 unit tests over lib/ (vitest)
npm run test:watch
npm run lint
npx tsc --noEmit

# End-to-end PWA checks. Needs a production build already serving:
npm run build && npm start
npm run verify:pwa   # in a second terminal
```

`npm test` covers the domain logic and the Google Books adapter in `lib/` —
streak edges, same-day log folding, page clamping, pace windows, genre
grouping, date keys across month and year boundaries, the internal consistency
of the sample shelf, and every mapping rule applied to raw Google volumes. No
DOM and no network; the modules are pure and `fetch` is injected.

`npm run verify:pwa` drives headless Chrome over the DevTools Protocol at a
390×844 viewport and checks the things a unit test cannot: the worker installs
and takes control, the shell precaches, an edited shelf survives a reload
without being re-seeded, every screen still renders with the network cut for
*both the page and the worker*, and no screen scrolls sideways. It reads
`CHROME_PATH` if your browser is somewhere unusual, and takes a target URL:
`npm run verify:pwa -- http://localhost:3111`.

## Screens

| Route       | What it is                                                      |
| ----------- | --------------------------------------------------------------- |
| `/`         | Shelf — streak counter, currently reading, want to read, finished |
| `/search`   | Live Google Books search, with the sample catalogue as fallback   |
| `/insights` | Four stat tiles, pages-by-month line, books-by-genre bars         |
| `/settings` | Placeholder reminders, daily goal, data reset, about             |

The streak counts consecutive local calendar days with at least one page
update. It stays alive through today if yesterday was logged, and its zero
state invites a first entry rather than reporting a failure.

**Dates are editable.** Tapping *Edit dates* on a finished book rewrites when
it was started and finished — otherwise the shelf records whenever you
happened to tap the button, not when you actually read it. Search also offers
*Already read*, which files a book straight to Finished with a date you
choose, for backfilling books read before the app existed. Both reject a
future date or a finish before the start.

Calendar days are stored as midday-local instants. Local midnight converted to
UTC lands on the previous day east of Greenwich, which would display a book
finished on the 1st as the 31st.

## Design system

Defined once as Tailwind v4 tokens in [`app/globals.css`](app/globals.css) and
used everywhere:

| Token           | Value     | Used for                          |
| --------------- | --------- | --------------------------------- |
| `ink`           | `#1B2A41` | Masthead, tab bar, primary buttons |
| `paper`         | `#F1ECDF` | Page background, cards             |
| `paper-dark`    | `#E4DCC5` | Stat tiles, chart wells, active cards |
| `marigold`      | `#C98A2B` | Accent, active tab, stamp, streak  |
| `teal`          | `#3F6F6B` | Progress bars, the pages line      |
| `charcoal`      | `#2A2620` | Body text                          |
| `rule`          | `#C9BFA0` | 1px hairlines                      |

Georgia for titles and headings, system sans for chrome and data. Flat colour,
1px borders, a single 4px radius, no gradients or shadows. Every card carries a
genre-coloured spine strip down its left edge — the one place colour means
something, kept consistent across Search, Shelf and Insights.

Shared primitives live in [`components/ui.tsx`](components/ui.tsx).

## Structure

```
app/            routes, api/books, manifest.json, global tokens
components/     screens, cards, shared primitives, charts/
lib/            types, catalog, storage, domain logic, derived stats
public/         sw.js, generated icons
scripts/        icon generator
```

`lib/` holds all the logic and none of the React:

- [`types.ts`](lib/types.ts) — transport-agnostic domain types
- [`catalog.ts`](lib/catalog.ts) — search with fallback, sample catalogue, genre colours
- [`googleBooks.ts`](lib/googleBooks.ts) — Google Books mapping, dedupe and ranking
- [`storage.ts`](lib/storage.ts) — the `LibraryRepository` interface
- [`library.ts`](lib/library.ts) — pure state transitions (add, start, log, finish)
- [`streaks.ts`](lib/streaks.ts), [`insights.ts`](lib/insights.ts) — derived figures
- [`seed.ts`](lib/seed.ts) — the demo shelf, loaded only on request from Settings

[`components/LibraryProvider.tsx`](components/LibraryProvider.tsx) owns state,
derives the streak and insights from it, and writes through to the repository.
No component touches storage directly.

## Google Books

Search calls [`/api/books`](app/api/books/route.ts), which holds the API key
server-side and proxies Google Books. The key is never sent to the browser.

```bash
# .env.local — never NEXT_PUBLIC_, which would inline it into the bundle
GOOGLE_BOOKS_API_KEY=AIza...
```

Get one at [console.cloud.google.com](https://console.cloud.google.com): enable
**Books API**, create an API key, then restrict it to Books API only. Use a
separate key from any Maps key — Maps keys are usually HTTP-referrer
restricted, only one application restriction can be active per key, and a
server request carries no referrer. Anonymous access is not a fallback: Google
now caps the keyless quota at zero, so unkeyed requests return 429.

**Search always returns something.** With no key, no network, or an exhausted
quota, `searchCatalog` falls back to the twelve-book sample catalogue and the
UI says which one answered — see `CatalogResults.reason`. That is also what the
installed app shows offline.

### What the raw API needs before it can drive a tracker

Google Books is a search index over every edition, not a clean catalogue.
Measured over 100 live volumes: **22% carry no `pageCount`**, 30% no
`categories`, a fifth are duplicate editions, and categories arrive in
inconsistent case. [`lib/googleBooks.ts`](lib/googleBooks.ts) handles all of it,
and every rule there is pure and unit-tested:

| Problem | What happens |
| --- | --- |
| No `pageCount` | Looked up individually first — the search endpoint under-reports, returning 0 pages for books whose detail record has a real count. Only dropped if still unknown, since the progress bar, slider and percentage are all defined against it. |
| Duplicate editions | Collapsed on title + author, ignoring subtitles and `(Movie Tie-In)`-style markers; the best-described edition wins. |
| Summaries and study guides | Ranked below real editions, matched on title, category *and* author — the mills publish as "Book Summary", "Hyper Summary". |
| Inconsistent category case | Normalized, so one genre cannot draw as two bars in the chart. |
| Category free text | `genre` is `string`, not an enum; `spineColor()` hashes unknown ones to a stable colour. A few aliases map common Google categories onto the app's own genres. |
| Descriptions | Several hundred words, with HTML, entities and mojibake. Cleaned and trimmed to ~180 characters. |

### Still to swap: the database

Implement `LibraryRepository` — `load`, `save`, `clear` — against your API and
pass it to `<LibraryProvider repository={…}>`. Shelf entries denormalize a
snapshot of the book rather than referencing the catalogue, so they survive
both swaps and stay readable offline.

## PWA

Hand-rolled rather than `next-pwa`: the app is four static routes plus
localStorage, so the whole offline story is "keep the shell, keep the hashed
assets".

- [`app/manifest.json`](app/manifest.json) — standalone, `#1B2A41` theme,
  `#F1ECDF` background, 192/512 icons plus maskable variants
- [`public/sw.js`](public/sw.js) — network-first for pages so an updated build is
  picked up on the next launch, cache-first for content-hashed `/_next/static`
  and icons, stale-while-revalidate for the rest. Bump `CACHE_VERSION` to retire
  every old cache.
- Registered from [`components/ServiceWorkerRegistrar.tsx`](components/ServiceWorkerRegistrar.tsx)
  on `load`, production only
- Icons are generated, not placeholders: `npm run icons` renders the stamp mark
  at every size from [`scripts/generate-icons.mjs`](scripts/generate-icons.mjs)

Safe-area insets are handled on the masthead and tab bar, and the status bar is
`black-translucent` so the navy masthead runs under it once installed.

All of this is checked by `npm run verify:pwa` — see [Tests](#tests).

Not verified: installation to an iOS home screen via Safari. That needs a real
device — the manifest, `apple-touch-icon` and `apple-mobile-web-app-*` tags are
in place and correct, but the install itself is untested.

## Known prototype limits

- Reminder toggles record preferences only; no notifications are wired up
- `userScalable: false` keeps the fixed masthead and tab bar stable in
  standalone mode, at the cost of pinch zoom — drop it from `viewport` in
  [`app/layout.tsx`](app/layout.tsx) if you would rather keep zoom
- The shelf starts empty; Settings → Data can load a demo library or clear everything
- Books whose page count cannot be established, even after an individual
  lookup, are hidden from search — they cannot drive any progress feature
