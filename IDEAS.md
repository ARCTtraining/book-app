# Reading Log — where to take it next

Written after building the prototype and watching it meet real data: a
21-book shelf, live Google Books search, and sync between a laptop and a
phone. Everything below is grounded in something that actually happened, and
each item says what it costs.

Ordered by what I would do first, not by size.

---

## 1. Things that are wrong now

These are defects, not enhancements. They are live.

### ~~The streak cannot work for a backfilled shelf~~ — resolved by habit

The 21 backfilled books produced 20 logs on 20 distinct days, so the streak
could only ever read 1. **Decided: no code change.** Logging daily from here
makes it correct within days, because the streak counts back from today and
leaves the isolated historical days behind it.

Worth knowing: `longest` is computed over all history, so it will read 1 until
a genuine run beats it. That is accurate, not a bug.

### Backfilled pages land in the wrong month, and that does not self-heal

The same root cause as the streak, but this half does **not** fix itself,
because it is about history rather than habit.

A backfilled book writes one log on its finish date carrying the whole book.
**8 of your 19 finished books span a month boundary** — 42% — and every page
is credited to the month it finished in. *Undermajordomo Minor* ran 12 March
to 14 April over 33 days; all 280 pages sit in April.

What that costs the chart:

| | Mar | Apr | May | Jun | Jul | Aug |
| --- | --- | --- | --- | --- | --- | --- |
| Charted now | 465 | 664 | 553 | 1044 | 732 | 1092 |
| Spread over the span | 704 | 504 | 742 | 758 | 1016 | 808 |
| Off by | −239 | +160 | −189 | +286 | −284 | +284 |

March is understated by a third. June and August are inflated by the books
that were mostly read in May and July.

New reading logged daily will be accurate, so this only ever concerns the
backfilled year — but that year does not correct itself, and it is the year
the chart currently shows.

**Decided: leave it.** 2026 is lumpy because it was reconstructed; 2027 will
be right. The totals, book counts, pace and reading record are all correct
either way — only the monthly shape is distorted, and only for the backfilled
year.

If it ever becomes worth fixing, the change is to spread a backfilled book's
pages across its reading span at an even daily rate, plus a migration for
books already entered. **Half a day.** It invents daily detail that was never
recorded, which would need saying plainly somewhere in the UI.

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

> **Done:** adding a book by ISBN or by pasting its Google Books link. Three
> books in one session were unreachable by any text query — *For Emma*
> (Ewan Morrison) and the Penguin *Nero* among them — and both resolve
> instantly by identifier.


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

## Where this leaves the shortlist

Triaged against how the app is actually being used, rather than what looked
important while building it.

| | Verdict |
| --- | --- |
| **Fix the streak** | **Not needed.** Logging daily from here fixes it without code. |
| **Repair author names** | **Low priority.** Noted, not fussed about. It only affects the most-read-author row. |
| **Notes and ratings** | **Someday.** The largest remaining feature, and the one that gives the app a reason to be opened between page updates. |
| **Show when a device is out of step** | **Now the strongest candidate.** It is the only item on the list that was hit in practice rather than predicted — books added on the laptop, absent on the phone, with nothing in the app saying so. An hour's work. |

Everything here is a working document. The decisions recorded above were taken
deliberately and can be revisited once the app has been lived with for longer.
