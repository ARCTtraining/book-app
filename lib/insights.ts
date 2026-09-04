import type { InsightsSummary, LibraryState } from "./types";
import {
  dayOf,
  daysBetween,
  monthKey,
  monthLabel,
  shiftDay,
  todayKey,
  type DayKey,
} from "./dates";

/** Trailing window for the recent pace figure. Recent enough to be actionable. */
export const PACE_WINDOW_DAYS = 30;

/**
 * Months shown on the pages-by-month line: January of the current year
 * through the current month.
 *
 * A trailing window kept sliding earlier months off the chart mid-year. The
 * calendar year is the span a reader actually thinks in, and stopping at the
 * current month keeps months that have not happened yet off the axis, where
 * they would read as months with no reading.
 */
export function monthsThisYear(today: DayKey): string[] {
  const [year, month] = today.split("-").map(Number);
  return Array.from({ length: month }, (_, i) => `${year}-${String(i + 1).padStart(2, "0")}`);
}

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
    avgPagesPerDayThisYear: avgPagesPerDayThisYear(state, today),
    year: Number(today.slice(0, 4)),
    booksOnShelf,
    pagesByMonth: pagesByMonth(state, today),
    record: readingRecord(state),
  };
}

/**
 * Mean pages/day across the calendar year so far.
 *
 * Divides by every day elapsed since 1 January, not by the days with reading
 * on them — a year-to-date pace that counts the quiet days is the honest one,
 * and it is what makes the figure comparable between months.
 */
function avgPagesPerDayThisYear(state: LibraryState, today: DayKey): number {
  const yearStart = `${today.slice(0, 4)}-01-01`;
  const pages = state.logs
    .filter((log) => log.day >= yearStart && log.day <= today)
    .reduce((sum, log) => sum + log.pagesRead, 0);

  if (pages === 0) return 0;
  const daysElapsed = daysBetween(yearStart, today) + 1;
  return Math.round(pages / Math.max(1, daysElapsed));
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

/**
 * How long a book took, in days, or null if the dates do not allow it.
 *
 * Floors at one day: a book started and finished on the same date took a
 * day's reading, not none, and a zero would divide badly.
 */
function daysToFinish(entry: LibraryState["entries"][number]): number | null {
  const started = dayOf(entry.startedAt);
  const finished = dayOf(entry.finishedAt);
  if (!started || !finished) return null;
  return Math.max(1, daysBetween(started, finished));
}

/**
 * The facts about a shelf that are worth stating outright.
 *
 * Everything here comes from the reader's own record — dates, page counts,
 * authors — rather than from catalogue metadata. That is deliberate: the
 * genre chart this replaced failed because Google Books returns three
 * categories for a whole year of reading.
 */
function readingRecord(state: LibraryState): InsightsSummary["record"] {
  const finished = state.entries.filter((e) => e.status === "finished");

  const byAuthor = new Map<string, number>();
  for (const entry of finished) {
    const author = entry.book.author;
    byAuthor.set(author, (byAuthor.get(author) ?? 0) + 1);
  }
  const topAuthors = [...byAuthor.entries()]
    .filter(([, books]) => books > 1)
    .map(([author, books]) => ({ author, books }))
    .sort((a, b) => b.books - a.books || a.author.localeCompare(b.author))
    .slice(0, 3);

  const longest = finished.reduce<(typeof finished)[number] | null>(
    (best, entry) => (!best || entry.book.pageCount > best.book.pageCount ? entry : best),
    null
  );

  const timed = finished
    .map((entry) => ({ entry, days: daysToFinish(entry) }))
    .filter((x): x is { entry: (typeof finished)[number]; days: number } => x.days !== null);

  const fastest = timed.reduce<(typeof timed)[number] | null>(
    (best, x) => (!best || x.days < best.days ? x : best),
    null
  );

  const totalDays = timed.reduce((sum, x) => sum + x.days, 0);
  const pagesWhileReading = timed.reduce((sum, x) => sum + x.entry.book.pageCount, 0);

  return {
    topAuthors,
    averagePageCount: finished.length
      ? Math.round(finished.reduce((s, e) => s + e.book.pageCount, 0) / finished.length)
      : 0,
    longestBook: longest
      ? { title: longest.book.title, pageCount: longest.book.pageCount }
      : null,
    averageDaysToFinish: timed.length ? Math.round(totalDays / timed.length) : 0,
    fastestFinish: fastest
      ? { title: fastest.entry.book.title, days: fastest.days }
      : null,
    // Pages per day spent inside a book, as opposed to per calendar day —
    // the difference between the two is how much of the year you were reading.
    pagesPerReadingDay: totalDays ? Math.round(pagesWhileReading / totalDays) : 0,
  };
}

/** Pages logged in each month of the year so far, gaps filled with 0. */
function pagesByMonth(state: LibraryState, today: DayKey) {
  const totals = new Map<string, number>();
  for (const log of state.logs) {
    const key = monthKey(log.day);
    totals.set(key, (totals.get(key) ?? 0) + log.pagesRead);
  }

  return monthsThisYear(today).map((key) => ({
    month: key,
    label: monthLabel(key),
    pages: totals.get(key) ?? 0,
  }));
}

