# Reading Log — where to take it next

Written after building the prototype and watching it meet real data: a
21-book shelf, live Google Books search, and sync between a laptop and a
phone. Everything below is grounded in something that actually happened, and
each item says what it costs.

Ordered by what I would do first, not by size.

---

## 1. Things that are wrong now

These are defects, not enhancements. They are live.

### The streak cannot work for a backfilled shelf

Your 21 books produced **20 progress logs across 20 distinct days** — one per
book, on the day it was finished. A streak counts consecutive days with a
log, so it can only ever read 1.

The streak was designed for a reader logging pages as they go. Backfilling a
year of reading was added later, and the two do not fit together: a book read
over three weeks contributes a single day.

Options, roughly in order of honesty:

- **Credit the reading span.** A book started on the 13th and finished on the
  17th counts as five reading days, not one. Truthful, and makes the streak
  meaningful the moment you backfill. Changes what a "log" means, so it
  touches `streaks.ts`, the seed, and the chart.
- **Say what the streak is for.** Keep it as-is but label it "days you logged
  pages" so a 1 is not read as a rebuke.
- **Drop it.** It is the weakest feature on the shelf for someone whose
  reading is recorded after the fact.

*I would credit the span.* The data to do it is already stored.

### Author names do not match themselves

Your shelf contains both:

```
John Le Carré     Tinker, Tailor, Soldier, Spy
John le Carr?     The Spy Who Came in From the Cold
```

Two problems in two records:

1. **Mojibake.** The `é` is genuinely corrupted in stored data, not just in
   display. `cleanBlurb` repairs descriptions but nothing repairs titles or
   authors — an oversight, since the same encoding fault produces both.
2. **Capitalisation.** Even repaired, `Le` and `le` are different strings, so
   "most-read author" counts one writer as two.

Fix: run the mojibake repair over title and author at mapping time, and fold
case and spacing when grouping by author. Small, and it makes the reading
record trustworthy. **Half an hour.**

### Nothing tells you the shelf is out of step

You added books on the laptop, opened the phone, and found them missing.
Nothing in the app said the laptop had changes the database did not.

Auto-sync now covers the common case, but it is silent when it fails — by
design, since a failed background sync should not interrupt reading. That
makes a quiet indicator more useful, not less:

- a line on the Shelf when local is ahead of the last successful sync
- it clears itself when a sync succeeds

**An hour**, and it turns sync from something you check into something you
trust.

### Sync failures name the wrong cause

When the server rejected a malformed payload, the app said *"The sync service
could not be reached."* It had been reached; it had refused. That sent you
looking at your network.

The failure taxonomy in `lib/sync.ts` distinguishes passphrase, unconfigured,
offline and server, but every server-side fault collapses into one message.
Worth splitting "could not be reached" from "the server refused this shelf",
and surfacing enough to act on. **An hour.**

---

## 2. Cheap, and worth doing

### Add a book by URL or ISBN

Google Books search cannot reach some volumes at all. The Penguin edition of
*Nero* (`ARXS0AEACAAJ`) is absent from every query form I tried — `intitle:`,
`inauthor:`, ISBN — yet the volume endpoint returns it complete with 416
pages.

Pasting a books.google.com URL or an ISBN would have solved that, and both
the times you came to me with a book you could not find. The lookup already
exists; it needs an input that recognises a URL or ISBN and fetches by id.
**Two hours.**

### Let a book have a page count you set

About a fifth of Google Books results carry no page count, and you chose to
hide those. That is right for search, but it means a book Google knows badly
cannot be tracked at all. A "set page count" field on the shelf card would
recover them without putting untrackable books in front of you. **Two hours.**

### Export the shelf

The shelf lives in one `localStorage` key and one MotherDuck database. There
is no export. Clearing site data on a device with unsynced changes loses
them, permanently and silently.

A "download my shelf" JSON is twenty lines and removes a whole category of
regret. **Half an hour.**

### Finish states beyond finished

There is no way to abandon a book, or to reopen one you finished. Both happen.
"Did not finish" is also more honest than deleting the record, and keeps the
insight that you started it. **Two hours.**

---

## 3. Larger, and worth considering

### Notes, ratings, quotes

The obvious missing half of a reading tracker. You can record *that* you read
something and *when*, but nothing about it. A rating and a free-text note per
book would carry most of the value; quotes with page numbers would carry more.

This is the first feature that makes the app worth opening when you are not
logging pages. **A day**, plus a schema change on both sides.

### A cover-led shelf

Every book now carries a cover (20 of 21 on your shelf). A grid of covers for
Finished would look like a bookshelf rather than a list, and is the single
biggest change available to how the app feels. The data is already there.
**Half a day.**

### Insights your data supports and Google's does not

Ideas measured against your real shelf:

- **Reading gaps** — days between finishing one book and starting the next.
  You have 19 books with both dates, so this is computable today.
- **Books finished per month** — a companion to pages, and less sensitive to
  book length.
- **Publication decade** — `publishedDate` is present on every book; it
  answers "am I reading new things or old things?"
- **Longest gap without reading** — the inverse of a streak, and for a
  backfilled shelf it is the more truthful figure.

**Two hours each**, and they share the machinery the reading record already
uses.

---

## 4. Structural decisions worth revisiting

### The passphrase is not authentication

One shared secret over HTTPS, on a public deployment. Proportionate for a
personal reading log; it is not access control. Anyone who learns it has full
read and write.

It also cannot support a second reader, because there is no notion of who is
asking. If the app ever holds anything you would mind losing or leaking, or
anyone else starts using it, this is the thing to change first — and it means
real accounts plus a user column on every table.

### Genre is dead weight

Across your books Google Books returns `Fiction`, `Literary Fiction`,
`Unfiled`, `Book Clubs (discussion Groups)` and `Antislavery Movements`. The
chart was removed for exactly this reason.

If genre matters, it has to come from you — a tag field you control. That is a
better feature than the chart ever was, but it is manual entry, which is the
thing prototypes are worst at judging. Worth deciding only after you have
lived with the app.

### Sync takes about six seconds

Down from 23, and it runs in the background so nothing waits on it. The floor
is roughly two seconds of connection setup per request. Reusing a connection
across invocations on Fluid Compute would remove most of that, at the cost of
a stale-socket failure mode. Only worth it if sync becomes something you watch.

### The chart resets every January

Pages-by-month covers the calendar year, so on 1 January it shows one column.
A rolling twelve months would never look empty but would not answer "how was
2026". Probably wants a year selector once there is more than one year to
choose between.

### iOS home-screen install is still unverified

The manifest, icons and Apple meta tags are correct, and the service worker
and offline behaviour are tested. The install itself has never been done on a
real iPhone. It is the one requirement from the original brief that remains
unconfirmed.

---

## 5. Deliberately not doing

Recorded so they do not get re-proposed.

- **MotherDuck as the primary store.** It is an analytical warehouse. Writing
  a row per slider drag suits it badly, and it would end the offline-first
  behaviour that makes the app usable on a phone.
- **Reminders that actually fire.** The settings are placeholders. Real
  notifications need a push service, VAPID keys, and a scheduler — a
  disproportionate amount of infrastructure for a nudge, and iOS only permits
  it for an installed PWA.
- **Automatic genre classification.** Inferring genre from description with a
  model would work, but it adds a paid dependency and a failure mode to a
  field nothing currently depends on.
- **A second charting library.** One line chart and a stat panel is the right
  amount of chart for this much data.

---

## If you only do three things

1. **Fix the streak** so a backfilled shelf produces a truthful number.
2. **Repair author names**, so the reading record can be believed.
3. **Add notes and ratings**, so there is a reason to open the app between
   page updates.
