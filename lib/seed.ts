import type { CatalogBook, LibraryState, ProgressLog, ShelfEntry } from "./types";
import { SAMPLE_CATALOG } from "./catalog";
import { DEFAULT_SETTINGS, STATE_VERSION } from "./storage";
import { isoFromDay, shiftDay, todayKey, type DayKey } from "./dates";

/**
 * Sample shelf for the prototype.
 *
 * Built relative to today so the charts, pace and streak always have shape to
 * evaluate — an empty Insights tab tells you nothing about whether Insights
 * works. Settings can clear this to reach the true empty states.
 *
 * This whole module goes away once real data exists.
 */

function book(title: string): CatalogBook {
  const found = SAMPLE_CATALOG.find((b) => b.title === title);
  if (!found) throw new Error(`Sample catalog has no "${title}"`);
  return found;
}

/** Deterministic jitter, so the demo shelf looks the same on every reload. */
function pseudoRandom(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

let counter = 0;
function seedId(prefix: string): string {
  counter += 1;
  return `seed-${prefix}-${counter}`;
}

interface FinishedSpec {
  title: string;
  /** Days before today the book was started / finished. */
  startedDaysAgo: number;
  finishedDaysAgo: number;
}

interface ReadingSpec {
  title: string;
  startedDaysAgo: number;
  currentPage: number;
  /** Days before today this book was last picked up. */
  activeDays: number[];
}

const FINISHED: FinishedSpec[] = [
  { title: "Sapiens", startedDaysAgo: 168, finishedDaysAgo: 141 },
  { title: "The White Album", startedDaysAgo: 138, finishedDaysAgo: 122 },
  { title: "The Girl with the Dragon Tattoo", startedDaysAgo: 118, finishedDaysAgo: 84 },
  { title: "The Emperor of All Maladies", startedDaysAgo: 80, finishedDaysAgo: 43 },
  { title: "Educated", startedDaysAgo: 40, finishedDaysAgo: 22 },
  { title: "Piranesi", startedDaysAgo: 19, finishedDaysAgo: 9 },
];

const READING: ReadingSpec[] = [
  {
    title: "Project Hail Mary",
    startedDaysAgo: 11,
    currentPage: 213,
    activeDays: [11, 10, 8, 7, 5, 3, 2, 1, 0],
  },
  {
    title: "The Overstory",
    startedDaysAgo: 6,
    currentPage: 96,
    activeDays: [6, 4, 3, 1, 0],
  },
];

const WANT_TO_READ = ["Klara and the Sun", "Devotions", "Thinking, Fast and Slow"];

/**
 * Spreads `pages` across `days` as plausible daily sessions, never negative
 * and always summing exactly to `pages`.
 */
function distribute(pages: number, days: DayKey[], rand: () => number): number[] {
  const weights = days.map(() => 0.4 + rand());
  const total = weights.reduce((a, b) => a + b, 0);
  const raw = weights.map((w) => Math.floor((w / total) * pages));
  let remainder = pages - raw.reduce((a, b) => a + b, 0);
  for (let i = 0; remainder > 0; i = (i + 1) % raw.length) {
    raw[i] += 1;
    remainder -= 1;
  }
  return raw;
}

/** Reading days between two offsets, skipping roughly a third of them. */
function sessionDays(
  today: DayKey,
  fromDaysAgo: number,
  toDaysAgo: number,
  rand: () => number
): DayKey[] {
  const days: DayKey[] = [];
  for (let d = fromDaysAgo; d >= toDaysAgo; d--) {
    if (rand() > 0.32) days.push(shiftDay(today, -d));
  }
  // Always keep the finishing day.
  const last = shiftDay(today, -toDaysAgo);
  if (days[days.length - 1] !== last) days.push(last);
  return days;
}

export function buildSampleLibrary(today: DayKey = todayKey()): LibraryState {
  counter = 0;
  const rand = pseudoRandom(20240213);
  const entries: ShelfEntry[] = [];
  const logs: ProgressLog[] = [];

  const iso = isoFromDay;

  for (const spec of FINISHED) {
    const target = book(spec.title);
    const entry: ShelfEntry = {
      id: seedId("entry"),
      book: target,
      status: "finished",
      currentPage: target.pageCount,
      addedAt: iso(shiftDay(today, -spec.startedDaysAgo - 2)),
      startedAt: iso(shiftDay(today, -spec.startedDaysAgo)),
      finishedAt: iso(shiftDay(today, -spec.finishedDaysAgo)),
    };
    entries.push(entry);

    const days = sessionDays(today, spec.startedDaysAgo, spec.finishedDaysAgo, rand);
    const amounts = distribute(target.pageCount, days, rand);
    let page = 0;
    days.forEach((day, i) => {
      page += amounts[i];
      logs.push({
        id: seedId("log"),
        entryId: entry.id,
        day,
        pagesRead: amounts[i],
        page,
        at: iso(day),
      });
    });
  }

  for (const spec of READING) {
    const target = book(spec.title);
    const entry: ShelfEntry = {
      id: seedId("entry"),
      book: target,
      status: "reading",
      currentPage: spec.currentPage,
      addedAt: iso(shiftDay(today, -spec.startedDaysAgo - 1)),
      startedAt: iso(shiftDay(today, -spec.startedDaysAgo)),
    };
    entries.push(entry);

    const days = spec.activeDays.map((d) => shiftDay(today, -d));
    const amounts = distribute(spec.currentPage, days, rand);
    let page = 0;
    days.forEach((day, i) => {
      page += amounts[i];
      logs.push({
        id: seedId("log"),
        entryId: entry.id,
        day,
        pagesRead: amounts[i],
        page,
        at: iso(day),
      });
    });
  }

  for (const title of WANT_TO_READ) {
    entries.push({
      id: seedId("entry"),
      book: book(title),
      status: "want",
      currentPage: 0,
      addedAt: iso(shiftDay(today, -Math.round(rand() * 20))),
    });
  }

  return {
    version: STATE_VERSION,
    entries,
    logs: logs.sort((a, b) => a.day.localeCompare(b.day)),
    settings: { ...DEFAULT_SETTINGS },
  };
}
