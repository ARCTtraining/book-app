import { describe, expect, it } from "vitest";
import { computeInsights, monthsThisYear, PACE_WINDOW_DAYS } from "./insights";
import { addToShelf, markFinished, updateProgress } from "./library";
import { emptyState } from "./storage";
import { SAMPLE_CATALOG } from "./catalog";
import { isoFromDay, shiftDay, todayKey } from "./dates";
import type { LibraryState, ProgressLog } from "./types";

const today = todayKey();
const piranesi = SAMPLE_CATALOG.find((b) => b.title === "Piranesi")!;
const sapiens = SAMPLE_CATALOG.find((b) => b.title === "Sapiens")!;
const devotions = SAMPLE_CATALOG.find((b) => b.title === "Devotions")!;

describe("computeInsights", () => {
  it("is all zeroes on an empty shelf, without dividing by zero", () => {
    const insights = computeInsights(emptyState(), today);

    expect(insights.totalPagesRead).toBe(0);
    expect(insights.booksFinished).toBe(0);
    expect(insights.avgPagesPerDay).toBe(0);
    expect(insights.booksOnShelf).toBe(0);
    // The axis still needs its buckets.
    expect(insights.pagesByMonth).toHaveLength(monthsThisYear(today).length);
    expect(insights.pagesByMonth.every((m) => m.pages === 0)).toBe(true);
  });

  it("counts a finished book in full and an open book to its bookmark", () => {
    // Not the sum of logged deltas — that would miss anything seeded as
    // already finished.
    let state = addToShelf(emptyState(), piranesi, "reading");
    state = markFinished(state, state.entries[0].id);
    state = addToShelf(state, sapiens, "reading");
    state = updateProgress(state, state.entries[0].id, 100);

    const insights = computeInsights(state, today);
    expect(insights.totalPagesRead).toBe(piranesi.pageCount + 100);
    expect(insights.booksFinished).toBe(1);
  });

  it("counts only unfinished books as on the shelf", () => {
    let state = addToShelf(emptyState(), piranesi, "want");
    state = addToShelf(state, sapiens, "reading");
    state = addToShelf(state, devotions, "reading");
    state = markFinished(state, state.entries[0].id);

    const insights = computeInsights(state, today);
    expect(insights.booksOnShelf).toBe(2);
    expect(insights.booksFinished).toBe(1);
  });

  it("buckets pages into the trailing months and fills gaps with zero", () => {
    const state: LibraryState = {
      ...emptyState(),
      logs: [mkLog("a", 0, 25), mkLog("b", 1, 15)],
    };

    const { pagesByMonth } = computeInsights(state, today);
    expect(pagesByMonth).toHaveLength(monthsThisYear(today).length);
    // The window ends on the current month.
    expect(pagesByMonth[monthsThisYear(today).length - 1].month).toBe(today.slice(0, 7));
    expect(pagesByMonth.reduce((sum, m) => sum + m.pages, 0)).toBe(40);
  });

  it("divides pace by the window once the shelf is older than it", () => {
    // Skipped days should pull the pace down — that is the point of a pace.
    const logs: ProgressLog[] = [
      mkLog("old", PACE_WINDOW_DAYS + 40, 500),
      mkLog("a", 0, 60),
      mkLog("b", 1, 60),
    ];
    const insights = computeInsights({ ...emptyState(), logs }, today);
    expect(insights.avgPagesPerDay).toBe(Math.round(120 / PACE_WINDOW_DAYS));
    expect(insights.paceWindowDays).toBe(PACE_WINDOW_DAYS);
  });

  it("divides a brand-new shelf by its own age, not the whole window", () => {
    // Day one should not read as a 1/30th-strength pace.
    const logs = [mkLog("a", 0, 50), mkLog("b", 1, 30)];
    const insights = computeInsights({ ...emptyState(), logs }, today);
    expect(insights.avgPagesPerDay).toBe(40);
  });

  it("excludes pages older than the window from the pace", () => {
    const logs = [mkLog("old", PACE_WINDOW_DAYS + 5, 900), mkLog("new", 0, 30)];
    const insights = computeInsights({ ...emptyState(), logs }, today);
    expect(insights.avgPagesPerDay).toBe(Math.round(30 / PACE_WINDOW_DAYS));
  });
});

function mkLog(id: string, daysAgo: number, pagesRead: number): ProgressLog {
  const day = shiftDay(today, -daysAgo);
  return { id, entryId: "e", day, pagesRead, page: pagesRead, at: day };
}

describe("the year-to-date view", () => {
  it("shows every month of the year so far, and none that have not happened", () => {
    // A trailing window slid February off the chart by August; the calendar
    // year is the span a reader thinks in.
    const months = monthsThisYear("2026-09-04");
    expect(months).toHaveLength(9);
    expect(months[0]).toBe("2026-01");
    expect(months[8]).toBe("2026-09");
  });

  it("is a single month in January", () => {
    expect(monthsThisYear("2026-01-15")).toEqual(["2026-01"]);
  });

  it("charts pages against those months, filling quiet ones with zero", () => {
    const state: LibraryState = {
      ...emptyState(),
      logs: [
        { id: "a", entryId: "e", day: "2026-02-18", pagesRead: 347, page: 347, at: "x" },
        { id: "b", entryId: "e", day: "2026-08-31", pagesRead: 246, page: 246, at: "x" },
      ],
    };
    const { pagesByMonth } = computeInsights(state, "2026-09-04");

    expect(pagesByMonth).toHaveLength(9);
    expect(pagesByMonth.find((m) => m.month === "2026-02")?.pages).toBe(347);
    expect(pagesByMonth.find((m) => m.month === "2026-08")?.pages).toBe(246);
    expect(pagesByMonth.find((m) => m.month === "2026-05")?.pages).toBe(0);
  });

  it("leaves last year's reading off this year's chart", () => {
    const state: LibraryState = {
      ...emptyState(),
      logs: [{ id: "a", entryId: "e", day: "2025-12-30", pagesRead: 400, page: 400, at: "x" }],
    };
    const { pagesByMonth } = computeInsights(state, "2026-09-04");
    expect(pagesByMonth.every((m) => m.pages === 0)).toBe(true);
  });
});

describe("pace for the year", () => {
  const yearLogs = (...days: [string, number][]): LibraryState => ({
    ...emptyState(),
    logs: days.map(([day, pagesRead], i) => ({
      id: String(i), entryId: "e", day, pagesRead, page: pagesRead, at: day,
    })),
  });

  it("divides by every day of the year so far, not the days with reading", () => {
    // 1 Jan to 10 Jan inclusive is 10 days; 500 pages is 50/day.
    const insights = computeInsights(yearLogs(["2026-01-05", 500]), "2026-01-10");
    expect(insights.avgPagesPerDayThisYear).toBe(50);
  });

  it("counts the quiet days, so a gap lowers the pace", () => {
    const busy = computeInsights(yearLogs(["2026-01-02", 300]), "2026-01-10");
    const same = computeInsights(yearLogs(["2026-01-02", 300]), "2026-03-10");
    expect(same.avgPagesPerDayThisYear).toBeLessThan(busy.avgPagesPerDayThisYear);
  });

  it("ignores reading from another year", () => {
    const insights = computeInsights(
      yearLogs(["2025-06-01", 5000], ["2026-01-05", 100]),
      "2026-01-10"
    );
    expect(insights.avgPagesPerDayThisYear).toBe(10);
  });

  it("is zero with nothing logged this year", () => {
    expect(computeInsights(emptyState(), "2026-09-04").avgPagesPerDayThisYear).toBe(0);
  });

  it("reports the year it covers", () => {
    expect(computeInsights(emptyState(), "2026-09-04").year).toBe(2026);
  });
});

describe("the reading record", () => {
  const book = (title: string, author: string, pageCount: number) => ({
    id: title, title, author, pageCount, genre: "Fiction",
  });
  const finished = (
    title: string, author: string, pages: number, started: string, ended: string
  ) => ({
    id: title,
    book: book(title, author, pages),
    status: "finished" as const,
    currentPage: pages,
    addedAt: isoFromDay(started),
    startedAt: isoFromDay(started),
    finishedAt: isoFromDay(ended),
    updatedAt: isoFromDay(ended),
  });

  const shelf = (entries: LibraryState["entries"]): LibraryState => ({
    ...emptyState(), entries,
  });

  const sample = shelf([
    finished("Nero", "Conn Iggulden", 331, "2026-07-13", "2026-07-17"),
    finished("Tyrant", "Conn Iggulden", 447, "2026-07-24", "2026-08-04"),
    finished("Clear", "Carys Davies", 224, "2026-03-25", "2026-03-26"),
  ]);

  it("names an author read more than once", () => {
    const { record } = computeInsights(sample, "2026-09-04");
    expect(record.topAuthors).toEqual([{ author: "Conn Iggulden", books: 2 }]);
  });

  it("says nothing about an author read only once", () => {
    const once = shelf([finished("Clear", "Carys Davies", 224, "2026-03-25", "2026-03-26")]);
    expect(computeInsights(once, "2026-09-04").record.topAuthors).toEqual([]);
  });

  it("finds the longest book", () => {
    const { record } = computeInsights(sample, "2026-09-04");
    expect(record.longestBook).toEqual({ title: "Tyrant", pageCount: 447 });
  });

  it("finds the fastest finish", () => {
    const { record } = computeInsights(sample, "2026-09-04");
    expect(record.fastestFinish).toEqual({ title: "Clear", days: 1 });
  });

  it("averages page count and days", () => {
    const { record } = computeInsights(sample, "2026-09-04");
    expect(record.averagePageCount).toBe(Math.round((331 + 447 + 224) / 3));
    // 4 + 11 + 1 days over three books.
    expect(record.averageDaysToFinish).toBe(Math.round((4 + 11 + 1) / 3));
  });

  it("counts pages against days inside a book, not calendar days", () => {
    // 1002 pages across 16 reading days — far above the year-to-date pace,
    // and that gap is the point of showing both.
    const { record } = computeInsights(sample, "2026-09-04");
    expect(record.pagesPerReadingDay).toBe(Math.round((331 + 447 + 224) / (4 + 11 + 1)));
  });

  it("counts a book started and finished the same day as one day", () => {
    const sameDay = shelf([finished("Clear", "C D", 224, "2026-03-25", "2026-03-25")]);
    expect(computeInsights(sameDay, "2026-09-04").record.fastestFinish?.days).toBe(1);
  });

  it("ignores unfinished books and books with no dates", () => {
    const mixed: LibraryState = shelf([
      finished("Nero", "Conn Iggulden", 331, "2026-07-13", "2026-07-17"),
      { ...finished("X", "Y", 900, "2026-01-01", "2026-01-02"), status: "reading" },
      { ...finished("Z", "W", 800, "2026-01-01", "2026-01-02"), startedAt: undefined },
    ]);
    const { record } = computeInsights(mixed, "2026-09-04");
    // The 900-page book is unfinished; the 800-page one counts for length
    // but cannot contribute a duration.
    expect(record.longestBook?.pageCount).toBe(800);
    expect(record.fastestFinish?.title).toBe("Nero");
  });

  it("reports nothing on an empty shelf", () => {
    const { record } = computeInsights(emptyState(), "2026-09-04");
    expect(record.topAuthors).toEqual([]);
    expect(record.longestBook).toBeNull();
    expect(record.fastestFinish).toBeNull();
    expect(record.averagePageCount).toBe(0);
    expect(record.pagesPerReadingDay).toBe(0);
  });
});
