import type { InsightsSummary, LibraryState } from "./types";
import {
  daysBetween,
  monthKey,
  monthLabel,
  shiftDay,
  todayKey,
  type DayKey,
} from "./dates";

/** How far back the pages-by-month line reaches. */
export const MONTH_WINDOW = 6;

/** Trailing window for the pace figure. Recent enough to be actionable. */
export const PACE_WINDOW_DAYS = 30;

export function computeInsights(
  state: LibraryState,
  today: DayKey = todayKey()
): InsightsSummary {
  const { entries } = state;

  // Pages read counts a finished book in full and an in-progress book up to
  // its bookmark, which is what a reader means by "pages read" — not the sum
  // of logged deltas, which would miss books seeded as already finished.
  const totalPagesRead = entries.reduce(
    (sum, entry) =>
      sum +
      (entry.status === "finished" ? entry.book.pageCount : entry.currentPage),
    0
  );

  const booksFinished = entries.filter((e) => e.status === "finished").length;
  const booksOnShelf = entries.filter((e) => e.status !== "finished").length;

  return {
    totalPagesRead,
    booksFinished,
    avgPagesPerDay: avgPagesPerDay(state, today),
    paceWindowDays: PACE_WINDOW_DAYS,
    booksOnShelf,
    pagesByMonth: pagesByMonth(state, today),
    booksByGenre: booksByGenre(state),
  };
}

/**
 * Mean pages/day over the trailing window.
 *
 * The divisor is the window, not the number of days you actually read, so
 * skipped days pull the pace down — that is the point of a pace figure. A
 * brand-new shelf divides by its own age instead, so day one does not read
 * as a 1/30th-strength pace.
 */
function avgPagesPerDay(state: LibraryState, today: DayKey): number {
  const logs = state.logs.filter((log) => log.pagesRead > 0);
  if (logs.length === 0) return 0;

  const windowStart = shiftDay(today, -(PACE_WINDOW_DAYS - 1));
  const pages = logs
    .filter((log) => log.day >= windowStart)
    .reduce((sum, log) => sum + log.pagesRead, 0);

  const firstDay = logs.reduce((min, log) => (log.day < min ? log.day : min), logs[0].day);
  const age = daysBetween(firstDay, today) + 1;
  const divisor = Math.max(1, Math.min(PACE_WINDOW_DAYS, age));

  return Math.round(pages / divisor);
}

/** Pages logged per month across the trailing window, gaps filled with 0. */
function pagesByMonth(state: LibraryState, today: DayKey) {
  const totals = new Map<string, number>();
  for (const log of state.logs) {
    const key = monthKey(log.day);
    totals.set(key, (totals.get(key) ?? 0) + log.pagesRead);
  }

  const [year, month] = today.split("-").map(Number);
  return Array.from({ length: MONTH_WINDOW }, (_, i) => {
    const date = new Date(year, month - 1 - (MONTH_WINDOW - 1 - i), 1);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    return { month: key, label: monthLabel(key), pages: totals.get(key) ?? 0 };
  });
}

/**
 * Books per genre, densest first.
 *
 * Built from whatever genres are actually on the shelf rather than a known
 * list, since Google Books categories are uncontrolled — a whitelist would
 * quietly drop books from the chart. Ties break alphabetically so the order
 * is stable between renders.
 */
function booksByGenre(state: LibraryState) {
  const counts = new Map<string, number>();
  for (const entry of state.entries) {
    counts.set(entry.book.genre, (counts.get(entry.book.genre) ?? 0) + 1);
  }

  return [...counts.entries()]
    .map(([genre, books]) => ({ genre, books }))
    .sort((a, b) => b.books - a.books || a.genre.localeCompare(b.genre));
}
