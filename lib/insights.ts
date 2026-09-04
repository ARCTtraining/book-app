import type { InsightsSummary, LibraryState } from "./types";
import {
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

