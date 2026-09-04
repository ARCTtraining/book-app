import { describe, expect, it } from "vitest";
import { buildSampleLibrary } from "./seed";
import { computeInsights, monthsThisYear } from "./insights";
import { computeStreak } from "./streaks";
import { todayKey } from "./dates";

/**
 * The sample shelf is what every screen is judged against during UX review,
 * so it has to be internally consistent and reach every state worth seeing.
 */
describe("buildSampleLibrary", () => {
  const today = todayKey();
  const state = buildSampleLibrary(today);

  it("fills all three shelf sections", () => {
    const count = (status: string) =>
      state.entries.filter((e) => e.status === status).length;

    expect(count("reading")).toBeGreaterThan(0);
    expect(count("want")).toBeGreaterThan(0);
    expect(count("finished")).toBeGreaterThan(0);
  });

  it("logs exactly the page count for every finished book", () => {
    for (const entry of state.entries.filter((e) => e.status === "finished")) {
      const logged = state.logs
        .filter((l) => l.entryId === entry.id)
        .reduce((sum, l) => sum + l.pagesRead, 0);
      expect(logged).toBe(entry.book.pageCount);
    }
  });

  it("logs exactly the bookmark for every book in progress", () => {
    for (const entry of state.entries.filter((e) => e.status === "reading")) {
      const logged = state.logs
        .filter((l) => l.entryId === entry.id)
        .reduce((sum, l) => sum + l.pagesRead, 0);
      expect(logged).toBe(entry.currentPage);
    }
  });

  it("leaves no orphaned logs", () => {
    const ids = new Set(state.entries.map((e) => e.id));
    expect(state.logs.every((l) => ids.has(l.entryId))).toBe(true);
  });

  it("arrives with a live streak, logged today", () => {
    const streak = computeStreak(state.logs, today);
    expect(streak.loggedToday).toBe(true);
    expect(streak.current).toBeGreaterThan(0);
  });

  it("gives the charts something to draw across the window", () => {
    const insights = computeInsights(state, today);
    expect(insights.pagesByMonth).toHaveLength(monthsThisYear(today).length);
    expect(insights.pagesByMonth.filter((m) => m.pages > 0).length).toBeGreaterThan(3);
  });


  it("is deterministic, so the demo looks the same on every reload", () => {
    const again = buildSampleLibrary(today);
    expect(again.entries.map((e) => e.book.title)).toEqual(
      state.entries.map((e) => e.book.title)
    );
    expect(again.logs.length).toBe(state.logs.length);
  });

  it("never dates a book in the future", () => {
    for (const entry of state.entries) {
      if (entry.finishedAt) expect(entry.finishedAt.slice(0, 10) <= today).toBe(true);
      if (entry.startedAt) expect(entry.startedAt.slice(0, 10) <= today).toBe(true);
    }
    expect(state.logs.every((l) => l.day <= today)).toBe(true);
  });
});
