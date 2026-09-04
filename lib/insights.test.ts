import { describe, expect, it } from "vitest";
import { computeInsights, MONTH_WINDOW, PACE_WINDOW_DAYS } from "./insights";
import { addToShelf, markFinished, updateProgress } from "./library";
import { emptyState } from "./storage";
import { SAMPLE_CATALOG } from "./catalog";
import { shiftDay, todayKey } from "./dates";
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
    expect(insights.booksByGenre).toEqual([]);
    // The axis still needs its buckets.
    expect(insights.pagesByMonth).toHaveLength(MONTH_WINDOW);
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

  it("keeps every genre on the shelf, densest first", () => {
    // Google Books categories are uncontrolled, so nothing may be filtered
    // against a known list.
    const state: LibraryState = {
      ...emptyState(),
      entries: [
        entry("1", "Poetry"),
        entry("2", "Hobbies & Home / Crafts"),
        entry("3", "Poetry"),
      ],
    };

    const { booksByGenre } = computeInsights(state, today);
    expect(booksByGenre).toEqual([
      { genre: "Poetry", books: 2 },
      { genre: "Hobbies & Home / Crafts", books: 1 },
    ]);
  });

  it("buckets pages into the trailing months and fills gaps with zero", () => {
    const state: LibraryState = {
      ...emptyState(),
      logs: [mkLog("a", 0, 25), mkLog("b", 1, 15)],
    };

    const { pagesByMonth } = computeInsights(state, today);
    expect(pagesByMonth).toHaveLength(MONTH_WINDOW);
    // The window ends on the current month.
    expect(pagesByMonth[MONTH_WINDOW - 1].month).toBe(today.slice(0, 7));
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

function entry(id: string, genre: string) {
  return {
    id,
    book: { ...piranesi, id: `book-${id}`, genre },
    status: "want" as const,
    currentPage: 0,
    addedAt: new Date().toISOString(),
  };
}

function mkLog(id: string, daysAgo: number, pagesRead: number): ProgressLog {
  const day = shiftDay(today, -daysAgo);
  return { id, entryId: "e", day, pagesRead, page: pagesRead, at: day };
}
