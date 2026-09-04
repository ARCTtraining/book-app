# Reading Log

A mobile-first PWA prototype for a personal reading tracker. This phase is UI/UX
only: a hardcoded sample catalogue stands in for the Google Books API, and
localStorage stands in for a database. No auth, no backend.

```bash
npm install
npm run dev          # http://localhost:3000
npm run build && npm start   # service worker only registers in production
```

## Screens

| Route       | What it is                                                      |
| ----------- | --------------------------------------------------------------- |
| `/`         | Shelf — streak counter, currently reading, want to read, finished |
| `/search`   | Filters the sample catalogue by title, author, genre or year      |
| `/insights` | Four stat tiles, pages-by-month line, books-by-genre bars         |
| `/settings` | Placeholder reminders, daily goal, data reset, about             |

The streak counts consecutive local calendar days with at least one page
update. It stays alive through today if yesterday was logged, and its zero
state invites a first entry rather than reporting a failure.

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
app/            routes, manifest.json, global tokens
components/     screens, cards, shared primitives, charts/
lib/            types, catalog, storage, domain logic, derived stats
public/         sw.js, generated icons
scripts/        icon generator
```

`lib/` holds all the logic and none of the React:

- [`types.ts`](lib/types.ts) — transport-agnostic domain types
- [`catalog.ts`](lib/catalog.ts) — the sample catalogue and genre colours
- [`storage.ts`](lib/storage.ts) — the `LibraryRepository` interface
- [`library.ts`](lib/library.ts) — pure state transitions (add, start, log, finish)
- [`streaks.ts`](lib/streaks.ts), [`insights.ts`](lib/insights.ts) — derived figures
- [`seed.ts`](lib/seed.ts) — the demo shelf, seeded on first run only

[`components/LibraryProvider.tsx`](components/LibraryProvider.tsx) owns state,
derives the streak and insights from it, and writes through to the repository.
No component touches storage directly.

## Swapping in the real thing

Both stand-ins sit behind an async seam, so neither swap reaches the UI.

**Google Books.** `searchCatalog(query)` in [`lib/catalog.ts`](lib/catalog.ts) is
already async and already has callers handling a pending state. Replace its body
with a `fetch` to a route handler that proxies
`https://www.googleapis.com/books/v1/volumes?q=…` (server-side, so the key stays
off the client) and map the response to `CatalogBook` — the field mapping is
written out in a comment at the top of that file. Note that `volumeInfo.pageCount`
is often missing and `categories` are uncontrolled free text; `genre` is typed as
`string` and `spineColor()` hashes unknown categories to a stable colour for
exactly this reason.

**A database.** Implement `LibraryRepository` — `load`, `save`, `clear` — against
your API and pass it to `<LibraryProvider repository={…}>`. Shelf entries
denormalize a snapshot of the book rather than referencing the catalogue, so
they survive the catalogue swap and stay readable offline.

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

### Verified

Against a production build, driven through the DevTools Protocol at a 390×844
viewport: service worker activates and controls the page; `/`, `/search`,
`/insights`, `/settings` and `/manifest.json` are precached; the shelf seeds on
first run, survives a reload and is not re-seeded over; and with the network cut
for both the page *and* the service worker, navigation still renders a full
screen with tab bar, stat tiles and both charts. No horizontal overflow on any
screen.

Not verified: installation to an iOS home screen via Safari. That needs a real
device — the manifest, `apple-touch-icon` and `apple-mobile-web-app-*` tags are
in place and correct, but the install itself is untested.

## Known prototype limits

- Reminder toggles record preferences only; no notifications are wired up
- `userScalable: false` keeps the fixed masthead and tab bar stable in
  standalone mode, at the cost of pinch zoom — drop it from `viewport` in
  [`app/layout.tsx`](app/layout.tsx) if you would rather keep zoom
- The sample shelf is seeded on first run; Settings → Data resets or clears it
